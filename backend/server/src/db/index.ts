import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { normalizeDatabaseUrl } from "../lib/database-url.js";
import { loadServerEnv } from "../lib/env.js";
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
  platformRateLimits,
  queueSlots,
  queuedPosts,
  resurfaceSchedules,
  resurfaceEvents,
  autoPlugs,
} from "./schema.js";

const env = loadServerEnv();

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
    platformRateLimits,
    queueSlots,
    queuedPosts,
    resurfaceSchedules,
    resurfaceEvents,
    autoPlugs,
  },
});

export async function closeDb() {
  await pool.end();
}
