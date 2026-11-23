import { createHash } from "node:crypto";

/**
 * How long a repeated tool call counts as a retry of the first one when the
 * agent passes no `idempotency_key`. Long enough to cover an agent re-sending
 * a call that timed out, short enough that posting the same text again later
 * in the day is a new post.
 */
export const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

/** JSON with object keys sorted at every depth; array order is kept. */
function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * The Idempotency-Key for one create/publish tool call.
 *
 * Agents retry tool calls that time out or look failed. A fresh random key per
 * call made every retry a second post, so without an explicit key the key is
 * derived from the tool and the exact request body within
 * `IDEMPOTENCY_WINDOW_MS`: the same call again is the same key, and the API
 * replays the first response instead of posting twice. The API binds a key to
 * its body, so any change to the request is a new key and a new post.
 */
export function idempotencyKeyFor(
  tool: string,
  body: unknown,
  explicitKey?: string,
  now: number = Date.now(),
): string {
  if (explicitKey) return explicitKey;
  const bucket = Math.floor(now / IDEMPOTENCY_WINDOW_MS);
  const digest = createHash("sha256")
    .update(`${tool}\n${bucket}\n${canonicalJson(body)}`)
    .digest("hex");
  return `mcp-${tool}-${digest.slice(0, 40)}`;
}
