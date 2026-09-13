import { createDb } from "./client.js";

let cached: ReturnType<typeof createDb> | null = null;

/**
 * Lazily built process-wide client, for shared modules that run in both the API
 * and the background worker and so cannot import either package's own `db`.
 *
 * Built on first use rather than at import so that loading one of those modules
 * never requires a database — the packages validate `DATABASE_URL` through
 * their own env schema at startup.
 */
function instance(): ReturnType<typeof createDb> {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    cached = createDb(url);
  }
  return cached;
}

export const db = new Proxy({} as ReturnType<typeof createDb>["db"], {
  get: (_t, prop) => Reflect.get(instance().db, prop),
});
