import { Redis } from "ioredis";
import type {
  JobProgressEvent,
  JobProgressPhase,
  JobProgressSnapshot,
} from "../types/job-progress.js";
import type { SupportedPlatform } from "../constants/platforms.js";

const STATE_TTL_SEC = 60 * 60 * 24; // 24h
const MAX_EVENTS = 100;

function stateKey(trackingId: string) {
  return `job:state:${trackingId}`;
}

function channelKey(trackingId: string) {
  return `job:events:${trackingId}`;
}

export class JobProgressStore {
  private publisher: Redis;

  constructor(redisUrl: string) {
    this.publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  async close() {
    await this.publisher.quit();
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
    await this.publisher.set(
      stateKey(input.trackingId),
      JSON.stringify(snapshot),
      "EX",
      STATE_TTL_SEC,
    );
    await this.publishEvent(input.trackingId, event);
    return snapshot;
  }

  async getSnapshot(trackingId: string): Promise<JobProgressSnapshot | null> {
    const raw = await this.publisher.get(stateKey(trackingId));
    if (!raw) return null;
    return JSON.parse(raw) as JobProgressSnapshot;
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

    await this.publisher.set(
      stateKey(input.trackingId),
      JSON.stringify(snapshot),
      "EX",
      STATE_TTL_SEC,
    );
    await this.publishEvent(input.trackingId, event);

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
    void subscriber.subscribe(channelKey(trackingId));
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

export function createJobProgressStore(redisUrl: string) {
  return new JobProgressStore(redisUrl);
}
