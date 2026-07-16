import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { normalizeDatabaseUrl } from "@social0/shared";
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
  publishJobs,
  publishJobEvents,
  workspaces,
  workspaceMembers,
  workspaceInvitations,
  workspacesRelations,
  workspaceMembersRelations,
  workspaceInvitationsRelations,
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
    publishJobs,
    publishJobEvents,
    workspaces,
    workspaceMembers,
    workspaceInvitations,
    workspacesRelations,
    workspaceMembersRelations,
    workspaceInvitationsRelations,
  },
});

export async function closeDb() {
  await pool.end();
}
