import type postgres from "postgres";

export type Sql = postgres.Sql;

/**
 * A Postgres client over Hyperdrive. `idle_timeout` lets a client held for a
 * whole queue message close its connection while a long upload runs, and
 * reconnect on the next query.
 */
export async function openSql(env: Env): Promise<Sql> {
  const { default: connect } = await import("postgres");
  return connect(env.HYPERDRIVE.connectionString, {
    max: 1,
    fetch_types: false,
    idle_timeout: 20,
  });
}

/**
 * Run `fn` with the caller's client, or with a client of its own that is
 * closed afterwards. The queue consumer opens one client per message and
 * passes it down, instead of every helper connecting for itself.
 */
export async function withSql<T>(
  env: Env,
  provided: Sql | undefined,
  fn: (sql: Sql) => Promise<T>,
): Promise<T> {
  if (provided) return fn(provided);
  const sql = await openSql(env);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 0 });
  }
}
