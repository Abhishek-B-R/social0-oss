import { sql, type SQL } from "drizzle-orm";
import { connectedAccounts } from "../db/schema.js";

/**
 * When the user last re-authorized a connected account, kept in
 * `platform_metadata.reconnectedAt` (ISO string; jsonb, so no schema change).
 *
 * `connected_accounts.updated_at` can't answer "was this reconnected?": token
 * refreshes (`persistTokens`) and the daily health sweep bump it too, so an
 * auth failure keyed off it would vanish from Home within hours while the
 * account keeps failing. Only the OAuth / BYOK connect paths write this key.
 */
export const RECONNECTED_AT_KEY = "reconnectedAt";

/**
 * Reconnect paths that already write `platformMetadata`: returns `metadata`
 * plus the stamp.
 */
export function withReconnectedAt(
  metadata: Record<string, unknown> | null | undefined,
  at: Date = new Date(),
): Record<string, unknown> {
  return { ...(metadata ?? {}), [RECONNECTED_AT_KEY]: at.toISOString() };
}

/**
 * Reconnect paths that don't otherwise touch `platformMetadata`: merges the
 * stamp in SQL so concurrent writers' keys are kept.
 */
export function reconnectedAtPatch(at: Date = new Date()): SQL<Record<string, unknown>> {
  return sql<Record<string, unknown>>`coalesce(${connectedAccounts.platformMetadata}, '{}'::jsonb) || jsonb_build_object(${RECONNECTED_AT_KEY}::text, ${at.toISOString()}::text)`;
}

/**
 * The account's last reconnect as a zone-less UTC timestamp (how every
 * `timestamp` column here is stored), falling back to `created_at` for
 * accounts never reconnected (or reconnected before the stamp existed).
 */
export const accountReconnectedAtSql: SQL = sql`coalesce((${connectedAccounts.platformMetadata} ->> ${RECONNECTED_AT_KEY}::text)::timestamptz at time zone 'UTC', ${connectedAccounts.createdAt}, 'epoch'::timestamp)`;
