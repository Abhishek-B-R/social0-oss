import type { FastifyInstance } from "fastify";
import type { JobProgressEvent, JobProgressSnapshot } from "@social0/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { connectedAccounts, postPublications, posts } from "../db/schema.js";
import { loadJobSnapshotFromDb } from "./job-snapshot-from-db.js";

export type EnrichedJobSnapshot = JobProgressSnapshot & {
  failureReason?: string | null;
};

function isTerminal(status: JobProgressSnapshot["status"]): boolean {
  return status === "completed" || status === "failed";
}

function progressScore(snapshot: JobProgressSnapshot): number {
  return snapshot.completed + snapshot.failed;
}

/** Prefer the snapshot that reflects the most publish progress. */
export function pickBetterJobSnapshot(
  a: JobProgressSnapshot | null,
  b: JobProgressSnapshot | null,
): JobProgressSnapshot | null {
  if (!a) return b;
  if (!b) return a;
  if (isTerminal(a.status) && !isTerminal(b.status)) return a;
  if (isTerminal(b.status) && !isTerminal(a.status)) return b;

  const scoreA = progressScore(a);
  const scoreB = progressScore(b);
  if (scoreA !== scoreB) return scoreB > scoreA ? b : a;

  if (a.events.length !== b.events.length) {
    return b.events.length > a.events.length ? b : a;
  }

  return new Date(b.updatedAt).getTime() >= new Date(a.updatedAt).getTime()
    ? b
    : a;
}

type PubRow = {
  status: string | null;
  platform: string | null;
  connectedAccountId: string | null;
  lastError: string | null;
};

function platformEventKey(
  platform: string | null | undefined,
  connectedAccountId: string | null | undefined,
): string | null {
  if (!platform) return null;
  return `${platform}:${connectedAccountId ?? platform}`;
}

function phaseForPublication(status: string | null): JobProgressEvent["phase"] {
  if (status === "published") return "platform_success";
  if (status === "failed") return "platform_failed";
  if (status === "publishing") return "platform_uploading";
  return "platform_queued";
}

function messageForPublication(pub: PubRow): string {
  if (pub.status === "published") return `Published to ${pub.platform}`;
  if (pub.status === "failed") {
    return pub.lastError?.trim() || `Failed on ${pub.platform}`;
  }
  if (pub.status === "publishing") return `Uploading to ${pub.platform}`;
  return `Queued ${pub.platform}`;
}

/** Publications are source of truth for per-platform outcome (matches dashboard UI). */
function mergeEventsFromPublications(
  snapshot: JobProgressSnapshot,
  pubs: PubRow[],
): JobProgressEvent[] {
  const now = new Date().toISOString();
  const completed = pubs.filter((p) => p.status === "published").length;
  const failed = pubs.filter((p) => p.status === "failed").length;
  const total = pubs.length;
  const progress = { completed, failed, total };

  const latestByPlatform = new Map<string, JobProgressEvent>();
  for (const event of snapshot.events) {
    const key = platformEventKey(event.platform, event.connectedAccountId);
    if (key) latestByPlatform.set(key, event);
  }

  for (const pub of pubs) {
    if (!pub.platform || !pub.connectedAccountId) continue;
    const key = platformEventKey(pub.platform, pub.connectedAccountId);
    if (!key) continue;
    const phase = phaseForPublication(pub.status);
    const message = messageForPublication(pub);
    const isTerminalPub =
      pub.status === "published" || pub.status === "failed";
    const existing = latestByPlatform.get(key);
    const existingTerminal =
      existing?.phase === "platform_success" ||
      existing?.phase === "platform_failed";

    if (isTerminalPub || !existing || !existingTerminal) {
      latestByPlatform.set(key, {
        trackingId: snapshot.trackingId,
        postId: snapshot.postId,
        userId: snapshot.userId,
        phase,
        platform: pub.platform as JobProgressEvent["platform"],
        connectedAccountId: pub.connectedAccountId,
        message,
        progress,
        ts: isTerminalPub ? now : (existing?.ts ?? now),
      });
    }
  }

  const nonPlatform = snapshot.events.filter((e) => !e.platform);
  return [...nonPlatform, ...latestByPlatform.values()];
}

function terminalCountsFromPublicationsAndEvents(
  pubs: PubRow[],
  events: JobProgressEvent[],
) {
  const latestEvents = new Map<string, JobProgressEvent>();
  for (const event of events) {
    const key = platformEventKey(event.platform, event.connectedAccountId);
    if (key) latestEvents.set(key, event);
  }

  let completed = 0;
  let failed = 0;
  for (const pub of pubs) {
    if (pub.status === "published") {
      completed++;
      continue;
    }
    if (pub.status === "failed") {
      failed++;
      continue;
    }

    const key = platformEventKey(pub.platform, pub.connectedAccountId);
    const event = key ? latestEvents.get(key) : undefined;
    if (event?.phase === "platform_success") completed++;
    if (event?.phase === "platform_failed") failed++;
  }

  return { completed, failed };
}

async function enrichSnapshotFromPublications(
  snapshot: JobProgressSnapshot,
): Promise<EnrichedJobSnapshot> {
  const [pubs, postRow] = await Promise.all([
    db
      .select({
        status: postPublications.status,
        platform: connectedAccounts.platform,
        connectedAccountId: postPublications.connectedAccountId,
        lastError: postPublications.lastError,
      })
      .from(postPublications)
      .innerJoin(
        connectedAccounts,
        eq(postPublications.connectedAccountId, connectedAccounts.id),
      )
      .where(eq(postPublications.postId, snapshot.postId)),
    db
      .select({ status: posts.status, failureReason: posts.failureReason })
      .from(posts)
      .where(eq(posts.id, snapshot.postId))
      .limit(1),
  ]);
  const postFailureReason =
    postRow[0]?.status === "failed" || postRow[0]?.status === "partial"
      ? (postRow[0]?.failureReason ?? null)
      : null;

  if (pubs.length === 0) {
    return { ...snapshot, failureReason: postFailureReason };
  }

  const events = mergeEventsFromPublications(snapshot, pubs);
  const { completed, failed } = terminalCountsFromPublicationsAndEvents(
    pubs,
    events,
  );
  const total = pubs.length;
  const allDone = completed + failed >= total;

  let status = snapshot.status;
  let updatedAt = snapshot.updatedAt;

  if (allDone) {
    status = failed === total ? "failed" : "completed";
    updatedAt = new Date().toISOString();
    if (!events.some((e) => e.phase === "completed" || e.phase === "failed")) {
      events.push({
        trackingId: snapshot.trackingId,
        postId: snapshot.postId,
        userId: snapshot.userId,
        phase: status,
        message:
          status === "completed"
            ? `Published to all ${total} platforms`
            : "Publish finished with failures",
        progress: { completed, failed, total },
        ts: updatedAt,
      });
    }
  }

  return {
    ...snapshot,
    status,
    total,
    completed,
    failed,
    events,
    updatedAt,
    failureReason: postFailureReason,
  };
}

export async function resolveJobSnapshot(
  app: FastifyInstance,
  trackingId: string,
): Promise<EnrichedJobSnapshot | null> {
  const [redisSnapshot, dbSnapshot] = await Promise.all([
    app.jobProgress.getSnapshot(trackingId),
    loadJobSnapshotFromDb(trackingId),
  ]);

  let snapshot = pickBetterJobSnapshot(redisSnapshot, dbSnapshot);
  if (!snapshot) return null;

  return enrichSnapshotFromPublications(snapshot);
}
