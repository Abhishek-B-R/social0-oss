import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { normalizeDatabaseUrl } from "@social0/shared";
import { loadWorkerEnv } from "../lib/env.js";
import {
  user,
  session,
  account,
  verification,
  connectedAccounts,
  mediaUploads,
  posts,
  postPublications,
  userSettings,
  trialClaims,
  subscriptionCancellations,
  queueSlots,
  queuedPosts,
  resurfaceSchedules,
  resurfaceEvents,
  autoPlugs,
  publishJobs,
  publishJobEvents,
} from "./schema.js";

const env = loadWorkerEnv();

const pool = new Pool({
  connectionString: normalizeDatabaseUrl(env.DATABASE_URL),
});

export const db = drizzle(pool, {
  schema: {
    user,
    session,
    account,
    verification,
    connectedAccounts,
    mediaUploads,
    posts,
    postPublications,
    userSettings,
    trialClaims,
    subscriptionCancellations,
    queueSlots,
    queuedPosts,
    resurfaceSchedules,
    resurfaceEvents,
    autoPlugs,
    publishJobs,
    publishJobEvents,
  },
});

export async function closeDb() {
  await pool.end();
}
