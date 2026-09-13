import { Redis } from "ioredis";
import type {
  JobProgressEvent,
  JobProgressPhase,
  JobProgressSnapshot,
} from "../types/job-progress.js";
import type { SupportedPlatform } from "../constants/platforms.js";

const STATE_TTL_SEC = 60 * 60 * 24; // 24h
const MAX_EVENTS = 100;
/** Bounded so a stalled Redis cannot pin an HTTP handler open. */
const REDIS_TIMEOUT_MS = 5_000;
const ERROR_LOG_INTERVAL_MS = 60_000;

function stateKey(trackingId: string) {
  return `job:state:${trackingId}`;
}

function channelKey(trackingId: string) {
  return `job:events:${trackingId}`;
}

export function createJobProgressStore(
  redisUrl: string,
  hooks?: JobProgressHooks,
) {
  return new JobProgressStore(redisUrl, hooks);
}

export type JobProgressHooks = {
  onInit?: (snapshot: JobProgressSnapshot) => Promise<void>;
  onEvent?: (
    event: JobProgressEvent,
    snapshot: JobProgressSnapshot,
  ) => Promise<void>;
};

export class JobProgressStore {
  private publisher: Redis;
  private hooks?: JobProgressHooks;
  private lastErrorLogAt = 0;

  constructor(redisUrl: string, hooks?: JobProgressHooks) {
    // This client is read and written from inside HTTP handlers. BullMQ's
    // `maxRetriesPerRequest: null` means a command issued while Redis is
    // unreachable waits forever, so an outage turned `POST /api/publish` and
    // `GET /api/jobs/:id` into requests that never answered instead of
    // degrading to the Postgres copy of the same data.
    this.publisher = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      connectTimeout: REDIS_TIMEOUT_MS,
      commandTimeout: REDIS_TIMEOUT_MS,
    });
    // Without a listener ioredis prints its own unhandled-error notice for
    // every reconnect attempt; throttle it to one line a minute instead.
    this.publisher.on("error", (err) => this.logRedisIssue("connection", err));
    this.hooks = hooks;
  }

  private logRedisIssue(operation: string, err: unknown): void {
    const now = Date.now();
    if (now - this.lastErrorLogAt < ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLogAt = now;
    console.warn(
      `[job-progress] redis ${operation} failed; progress is degraded`,
      err instanceof Error ? err.message : err,
    );
  }

  /**
   * Job progress is a convenience layer over `publish_jobs` /
   * `publish_job_events`, so a Redis failure must never fail the publish that
   * triggered it — the durable record still gets written by the hooks.
   */
  private async tryRedis(
    operation: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logRedisIssue(operation, err);
    }
  }

  async close() {
    try {
      await this.publisher.quit();
    } catch {
      // Already down or mid-reconnect: drop the socket rather than hang shutdown.
      this.publisher.disconnect();
    }
  }

  async initJob(input: {
    trackingId: string;
    postId: string;
    userId: string;
    total?: number;
  }): Promise<JobProgressSnapshot> {
    const now = new Date().toISOString();
    const event: JobProgressEvent = {
      trackingId: input.trackingId,
      postId: input.postId,
      userId: input.userId,
      phase: "queued",
      message: "Publish job queued",
      progress: { completed: 0, failed: 0, total: input.total ?? 0 },
      ts: now,
    };
    const snapshot: JobProgressSnapshot = {
      trackingId: input.trackingId,
      postId: input.postId,
      userId: input.userId,
      status: "queued",
      total: input.total ?? 0,
      completed: 0,
      failed: 0,
      events: [event],
      updatedAt: now,
    };
    await this.tryRedis("initJob", async () => {
      await this.publisher.set(
        stateKey(input.trackingId),
        JSON.stringify(snapshot),
        "EX",
        STATE_TTL_SEC,
      );
      await this.publishEvent(input.trackingId, event);
    });
    await this.hooks?.onInit?.(snapshot);
    return snapshot;
  }

  /**
   * Null on a Redis failure as well as a miss: callers already merge this with
   * the database snapshot, so degrading to that is the correct answer.
   */
  async getSnapshot(trackingId: string): Promise<JobProgressSnapshot | null> {
    let raw: string | null;
    try {
      raw = await this.publisher.get(stateKey(trackingId));
    } catch (err) {
      this.logRedisIssue("getSnapshot", err);
      return null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as JobProgressSnapshot;
    } catch (err) {
      this.logRedisIssue("getSnapshot parse", err);
      return null;
    }
  }

  async emit(input: {
    trackingId: string;
    postId: string;
    userId: string;
    phase: JobProgressPhase;
    platform?: SupportedPlatform;
    connectedAccountId?: string;
    message?: string;
    setTotal?: number;
  }): Promise<JobProgressSnapshot | null> {
    const snapshot = await this.getSnapshot(input.trackingId);
    if (!snapshot) return null;

    if (input.setTotal !== undefined) {
      snapshot.total = input.setTotal;
    }

    if (
      input.phase === "platform_success" ||
      input.phase === "platform_failed"
    ) {
      if (input.phase === "platform_success") snapshot.completed += 1;
      if (input.phase === "platform_failed") snapshot.failed += 1;
    }

    if (input.phase === "fan_out" || input.phase === "platform_uploading") {
      snapshot.status = "processing";
    }
    if (input.phase === "completed") snapshot.status = "completed";
    if (input.phase === "failed") snapshot.status = "failed";

    const event: JobProgressEvent = {
      trackingId: input.trackingId,
      postId: input.postId,
      userId: input.userId,
      phase: input.phase,
      platform: input.platform,
      connectedAccountId: input.connectedAccountId,
      message: input.message,
      progress: {
        completed: snapshot.completed,
        failed: snapshot.failed,
        total: snapshot.total,
      },
      ts: new Date().toISOString(),
    };

    snapshot.events.push(event);
    if (snapshot.events.length > MAX_EVENTS) {
      snapshot.events = snapshot.events.slice(-MAX_EVENTS);
    }
    snapshot.updatedAt = event.ts;

    await this.tryRedis("emit", async () => {
      await this.publisher.set(
        stateKey(input.trackingId),
        JSON.stringify(snapshot),
        "EX",
        STATE_TTL_SEC,
      );
      await this.publishEvent(input.trackingId, event);
    });
    await this.hooks?.onEvent?.(event, snapshot);

    if (
      snapshot.total > 0 &&
      snapshot.completed + snapshot.failed >= snapshot.total &&
      snapshot.status === "processing"
    ) {
      const finalPhase: JobProgressPhase =
        snapshot.failed > 0 && snapshot.completed === 0
          ? "failed"
          : "completed";
      const finalMessage =
        snapshot.failed > 0
          ? `Published to ${snapshot.completed}/${snapshot.total} platforms (${snapshot.failed} failed)`
          : `Published to all ${snapshot.total} platforms`;
      return this.emit({
        trackingId: input.trackingId,
        postId: input.postId,
        userId: input.userId,
        phase: finalPhase,
        message: finalMessage,
      });
    }

    return snapshot;
  }

  private async publishEvent(trackingId: string, event: JobProgressEvent) {
    await this.publisher.publish(channelKey(trackingId), JSON.stringify(event));
  }

  /** Subscribe to live events. Caller must call unsubscribe() on the returned Redis client. */
  subscribe(
    trackingId: string,
    onEvent: (event: JobProgressEvent) => void,
  ): Redis {
    const subscriber = this.publisher.duplicate();
    // A rejected SUBSCRIBE (Redis down) would otherwise surface as an unhandled
    // rejection and take the process with it. Losing live events only costs the
    // caller its push updates, so log and carry on.
    subscriber.on("error", (err) => this.logRedisIssue("subscriber", err));
    subscriber
      .subscribe(channelKey(trackingId))
      .catch((err) => this.logRedisIssue("subscribe", err));
    subscriber.on("message", (_channel, message) => {
      try {
        onEvent(JSON.parse(message) as JobProgressEvent);
      } catch {
        // ignore malformed
      }
    });
    return subscriber;
  }
}
