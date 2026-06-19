/**
 * pg-connection-string v2 treats sslmode=require/prefer/verify-ca as verify-full.
 * Normalize remote URLs to sslmode=verify-full explicitly before pg v9 changes semantics.
 * @see https://www.postgresql.org/docs/current/libpq-ssl.html
 */
export function normalizeDatabaseUrl(connectionString: string): string {
  if (/sslmode=verify-full/i.test(connectionString)) {
    return connectionString;
  }

  // Local Postgres typically has no TLS.
  if (/(@localhost|@127\.0\.0\.1|:localhost|:127\.0\.0\.1)/i.test(connectionString)) {
    return connectionString;
  }

  if (/sslmode=(prefer|require|verify-ca)/i.test(connectionString)) {
    return connectionString.replace(
      /sslmode=(prefer|require|verify-ca)/gi,
      "sslmode=verify-full",
    );
  }

  if (!/sslmode=/i.test(connectionString)) {
    const separator = connectionString.includes("?") ? "&" : "?";
    return `${connectionString}${separator}sslmode=verify-full`;
  }

  return connectionString;
}
