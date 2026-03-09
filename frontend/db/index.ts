import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import {
  // Better Auth tables
  user,
  session,
  account,
  verification,
  // App tables
  connectedAccounts,
  mediaUploads,
  posts,
  postPublications,
  userSettings,
  platformRateLimits,
  queueSlots,
  queuedPosts,
} from "./schema";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create drizzle instance with tables only
// Relations are defined in schema.ts but not passed here to avoid compatibility issues
// They can still be used for type-safe queries via db.query
export const db = drizzle(pool, {
  schema: {
    // Better Auth tables (required by Better Auth adapter)
    user,
    session,
    account,
    verification,
    // App tables
    connectedAccounts,
    mediaUploads,
    posts,
    postPublications,
    userSettings,
    platformRateLimits,
    queueSlots,
    queuedPosts,
  },
});
