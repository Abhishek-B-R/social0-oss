import type { FastifyInstance } from "fastify";
import type { JobProgressSnapshot } from "@social0/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { connectedAccounts, postPublications } from "../db/schema.js";
import { loadJobSnapshotFromDb } from "./job-snapshot-from-db.js";

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

/** When CF publish updates publications but Redis/DB job rows lag, derive terminal status from publications. */
async function reconcileFromPublications(
  snapshot: JobProgressSnapshot,
): Promise<JobProgressSnapshot> {
  if (isTerminal(snapshot.status)) return snapshot;

  const pubs = await db
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
    .where(eq(postPublications.postId, snapshot.postId));

  if (pubs.length === 0) return snapshot;

  const isDone = (status: string | null) =>
    status === "published" || status === "failed";
  if (!pubs.every((p) => isDone(p.status))) return snapshot;

  const completed = pubs.filter((p) => p.status === "published").length;
  const failed = pubs.filter((p) => p.status === "failed").length;
  const total = pubs.length;
  const status: JobProgressSnapshot["status"] =
    failed === total ? "failed" : "completed";
  const now = new Date().toISOString();

  const existingKeys = new Set(
    snapshot.events
      .filter((e) => e.platform)
      .map((e) => `${e.platform}:${e.connectedAccountId}:${e.phase}`),
  );

  const events = [...snapshot.events];
  for (const pub of pubs) {
    if (!pub.platform || !pub.connectedAccountId) continue;
    const phase =
      pub.status === "published" ? "platform_success" : "platform_failed";
    const key = `${pub.platform}:${pub.connectedAccountId}:${phase}`;
    if (existingKeys.has(key)) continue;
    events.push({
      trackingId: snapshot.trackingId,
      postId: snapshot.postId,
      userId: snapshot.userId,
      phase,
      platform: pub.platform,
      connectedAccountId: pub.connectedAccountId,
      message:
        pub.status === "published"
          ? `Published to ${pub.platform}`
          : (pub.lastError ?? `Failed on ${pub.platform}`),
      progress: { completed, failed, total },
      ts: now,
    });
  }

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
      ts: now,
    });
  }

  return {
    ...snapshot,
    status,
    total,
    completed,
    failed,
    events,
    updatedAt: now,
  };
}

export async function resolveJobSnapshot(
  app: FastifyInstance,
  trackingId: string,
): Promise<JobProgressSnapshot | null> {
  const [redisSnapshot, dbSnapshot] = await Promise.all([
    app.jobProgress.getSnapshot(trackingId),
    loadJobSnapshotFromDb(trackingId),
  ]);

  let snapshot = pickBetterJobSnapshot(redisSnapshot, dbSnapshot);
  if (!snapshot) return null;

  return reconcileFromPublications(snapshot);
}
