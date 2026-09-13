import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { normalizeDatabaseUrl } from "../lib/database-url.js";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>["db"];

/**
 * One pooled drizzle client over the whole schema.
 *
 * The server and the background worker built this identically, differing only
 * in which env loader supplied the URL, and each hand-listed the tables to
 * register for relational queries — lists that had already fallen behind the
 * schema, so `db.query` was missing tables that exist. Passing the module
 * keeps that list from being a thing anyone has to maintain.
 */
export function createDb(databaseUrl: string): {
  db: ReturnType<typeof drizzle<typeof schema>>;
  closeDb: () => Promise<void>;
} {
  const pool = new Pool({
    connectionString: normalizeDatabaseUrl(databaseUrl),
  });

  return {
    db: drizzle(pool, { schema }),
    closeDb: () => pool.end(),
  };
}
