/**
 * The schema lives in `@social0/shared/db/schema` so the server and the
 * background worker cannot drift apart — they had, and the worker's copy was
 * missing the Teams foreign keys and several columns. This re-export keeps the
 * `@/db/schema` import path every caller already uses.
 */
export * from "@social0/shared/db/schema";
