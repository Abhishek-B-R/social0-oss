import type { FastifyInstance } from "fastify";
import {
  createJobProgressStore,
  getRedisUrl,
  type JobProgressStore,
} from "@social0/shared";
import { db } from "../db/index.js";
import { publishJobEvents, publishJobs } from "../db/schema.js";

/** Postgres undefined_table */
export function isMissingRelationError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "42P01";
}

let publishJobTablesAvailable: boolean | null = null;

/** Probe once - false when publish_jobs was never migrated. */
export async function hasPublishJobTables(): Promise<boolean> {
  if (publishJobTablesAvailable !== null) {
    return publishJobTablesAvailable;
  }
  try {
    await db
      .select({ trackingId: publishJobs.trackingId })
      .from(publishJobs)
      .limit(1);
    publishJobTablesAvailable = true;
  } catch (err) {
    if (isMissingRelationError(err)) {
      publishJobTablesAvailable = false;
      console.warn(
        "[publish] publish_jobs table missing - using Redis-only job progress (no migration required)",
      );
    } else {
      throw err;
    }
  }
  return publishJobTablesAvailable;
}

let redisOnlyProgress: JobProgressStore | null = null;

export function getRedisOnlyJobProgress(): JobProgressStore {
  if (!redisOnlyProgress) {
    redisOnlyProgress = createJobProgressStore(getRedisUrl());
  }
  return redisOnlyProgress;
}

export function jobProgressForStandalone(
  app: FastifyInstance | null | undefined,
): JobProgressStore | null {
  return app?.jobProgress ?? null;
}

export async function resolveJobProgressStore(
  app: FastifyInstance | null | undefined,
): Promise<JobProgressStore> {
  if (app?.jobProgress) return app.jobProgress;
  if (await hasPublishJobTables()) {
    return getRedisOnlyJobProgress();
  }
  return getRedisOnlyJobProgress();
}

export async function safeDbPublishTracking<T>(
  fn: () => Promise<T>,
): Promise<T | undefined> {
  if (!(await hasPublishJobTables())) return undefined;
  try {
    return await fn();
  } catch (err) {
    if (isMissingRelationError(err)) {
      publishJobTablesAvailable = false;
      console.warn(
        "[publish] publish_jobs write skipped - table missing, using Redis",
      );
      return undefined;
    }
    throw err;
  }
}

export async function safeDbPublishEvent(
  values: typeof publishJobEvents.$inferInsert,
): Promise<void> {
  await safeDbPublishTracking(() => db.insert(publishJobEvents).values(values));
}
