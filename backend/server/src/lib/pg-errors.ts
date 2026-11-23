/**
 * Postgres error helpers. Drizzle sometimes wraps the driver error in
 * `cause`, so both shapes are checked.
 */
function pgError(
  err: unknown,
): { code?: string; constraint?: string } | undefined {
  if (!err || typeof err !== "object") return undefined;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && "code" in cause) {
    return cause as { code?: string; constraint?: string };
  }
  if ("code" in err) return err as { code?: string; constraint?: string };
  return undefined;
}

/** True for a unique violation (23505), optionally on one named index. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const pg = pgError(err);
  if (pg?.code !== "23505") return false;
  return constraint === undefined || pg.constraint === constraint;
}
