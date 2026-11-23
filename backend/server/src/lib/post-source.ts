import type { FastifyRequest } from "fastify";
import { eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys, posts, user } from "../db/schema.js";
import { getMcpConnectorClient, isMcpConnectorKeyName } from "./mcp-oauth.js";

/**
 * Who created a post, stamped once on `posts.metadata.source` at creation.
 *
 * - `user`: the dashboard (the person is `posts.created_by_user_id`).
 * - `api_key`: `/v1` with an API key. `via` is "cli" when the request came
 *   from the social0 CLI (it sends `X-Social0-Client: cli`), else "api".
 * - `mcp`: an MCP host (hosted connector via OAuth, or the stdio server).
 *   `client` is the host's name when known (e.g. "ChatGPT").
 *
 * The server owns this key: client-supplied `source` is always replaced on
 * create and carried over (never dropped or overwritten) on update.
 */
export type StoredPostSource =
  | { kind: "user" }
  | { kind: "api_key"; keyId: string; keyName: string; via: "cli" | "api" }
  | { kind: "mcp"; client?: string; keyId?: string; keyName?: string };

export const POST_SOURCE_METADATA_KEY = "source";

/**
 * Display-ready source for API responses. The SPA turns it into a chip:
 * user + isCurrentUser → "You"; user → userName; mcp → "<client> · MCP";
 * api_key + via cli → "CLI · <keyName>"; api_key → "API · <keyName>".
 */
export type PostSourceDto = {
  kind: "user" | "api_key" | "mcp";
  /** kind "user": the creator (falls back to the post owner on old rows). */
  userId: string | null;
  userName: string | null;
  isCurrentUser: boolean;
  keyId: string | null;
  keyName: string | null;
  /** api_key: "cli" | "api". mcp: host name (e.g. "ChatGPT") or null. */
  client: string | null;
};

const MAX_LABEL_LENGTH = 80;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Each run of C0 control characters (and DEL) replaced by `with`. */
function replaceControlRuns(value: string, replacement: string): string {
  let out = "";
  let inRun = false;
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      if (!inRun) out += replacement;
      inRun = true;
    } else {
      out += ch;
      inRun = false;
    }
  }
  return out;
}

function cleanLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Printable, single line, bounded: these end up in chips and activity rows.
  const cleaned = replaceControlRuns(value, " ").trim();
  return cleaned ? cleaned.slice(0, MAX_LABEL_LENGTH) : undefined;
}

/** Parse a stored `metadata.source`; null when absent or malformed. */
export function readStoredPostSource(metadata: unknown): StoredPostSource | null {
  const raw = asRecord(asRecord(metadata)?.[POST_SOURCE_METADATA_KEY]);
  if (!raw) return null;
  if (raw.kind === "user") return { kind: "user" };
  if (raw.kind === "api_key") {
    const keyId = typeof raw.keyId === "string" ? raw.keyId : "";
    return {
      kind: "api_key",
      keyId,
      keyName: cleanLabel(raw.keyName) ?? "API key",
      via: raw.via === "cli" ? "cli" : "api",
    };
  }
  if (raw.kind === "mcp") {
    const client = cleanLabel(raw.client);
    const keyName = cleanLabel(raw.keyName);
    return {
      kind: "mcp",
      ...(client ? { client } : {}),
      ...(typeof raw.keyId === "string" ? { keyId: raw.keyId } : {}),
      ...(keyName ? { keyName } : {}),
    };
  }
  return null;
}

/**
 * Return `metadata` with `source` set to `source`, keeping every other key.
 * Used on create, where the server's view of the caller always wins.
 */
export function withPostSource(
  metadata: Record<string, unknown> | null | undefined,
  source: StoredPostSource,
): Record<string, unknown> {
  return { ...(metadata ?? {}), [POST_SOURCE_METADATA_KEY]: source };
}

/**
 * For updates that replace metadata wholesale: drop any client-supplied
 * `source` and keep the one already stored on the post. Returns null when
 * the result is empty so the column stays NULL (same as sanitize).
 */
export function carryPostSource(
  next: Record<string, unknown> | null | undefined,
  existingMetadata: unknown,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = { ...(next ?? {}) };
  delete out[POST_SOURCE_METADATA_KEY];
  const existing = asRecord(existingMetadata)?.[POST_SOURCE_METADATA_KEY];
  if (existing !== undefined) out[POST_SOURCE_METADATA_KEY] = existing;
  return Object.keys(out).length > 0 ? out : null;
}

/** SQL: post was created by an API key or MCP host (drafts → "Needs review"). */
export function agentSourceCondition(): SQL {
  return sql`(${posts.metadata} -> 'source' ->> 'kind') in ('api_key', 'mcp')`;
}

/** Header values clients send to identify themselves on `/v1`. */
function clientHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : undefined;
}

/**
 * Work out the source for a `/v1` request authenticated with an API key.
 *
 * - The OAuth connector key ("MCP Connector") is always MCP. The host name
 *   comes from `X-Social0-Mcp-Client` when the MCP worker forwards it, else
 *   from the client the user last approved.
 * - `X-Social0-Client: mcp` marks the stdio MCP server running on a user key.
 * - `X-Social0-Client: cli` marks the CLI.
 * - Anything else is a plain API call.
 *
 * Headers are self-asserted by the key holder; this is attribution, not auth.
 */
export async function resolveV1PostSource(
  request: FastifyRequest,
): Promise<StoredPostSource | null> {
  const auth = request.v1Auth;
  if (!auth?.apiKeyId) return null;

  const [key] = await db
    .select({ name: apiKeys.name })
    .from(apiKeys)
    .where(eq(apiKeys.id, auth.apiKeyId))
    .limit(1);
  const keyName = cleanLabel(key?.name) ?? "API key";
  const declared = clientHeader(request, "x-social0-client")?.toLowerCase();

  if (isMcpConnectorKeyName(key?.name) || declared?.startsWith("mcp")) {
    let client = cleanLabel(clientHeader(request, "x-social0-mcp-client"));
    if (!client && isMcpConnectorKeyName(key?.name)) {
      const approved = await getMcpConnectorClient(auth.userId).catch(() => null);
      client = cleanLabel(approved?.clientName);
      // Legacy connector name predates dynamic registration names.
      if (!client && key?.name === "Claude MCP Connector") client = "Claude";
    }
    return {
      kind: "mcp",
      ...(client ? { client } : {}),
      keyId: auth.apiKeyId,
      keyName,
    };
  }

  return {
    kind: "api_key",
    keyId: auth.apiKeyId,
    keyName,
    via: declared?.startsWith("cli") ? "cli" : "api",
  };
}

/** Batch-load display names for creators. */
export async function loadUserNames(
  ids: Iterable<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const unique = [...new Set([...ids].filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, unique));
  return new Map(rows.map((r) => [r.id, r.name ?? null]));
}

/**
 * Resolve the display source for one post. Rows created before stamping have
 * no `source`: they came from the dashboard, or from `/v1` (which never set
 * `created_by_user_id`). Both read as the owner, which is the honest default.
 */
export function toPostSourceDto(
  row: {
    metadata: unknown;
    createdByUserId?: string | null;
    ownerUserId: string;
  },
  ctx: { actorUserId: string; userNames: Map<string, string | null> },
): PostSourceDto {
  const stored = readStoredPostSource(row.metadata);
  if (stored?.kind === "api_key") {
    return {
      kind: "api_key",
      userId: row.createdByUserId ?? row.ownerUserId,
      userName: null,
      isCurrentUser: false,
      keyId: stored.keyId || null,
      keyName: stored.keyName,
      client: stored.via,
    };
  }
  if (stored?.kind === "mcp") {
    return {
      kind: "mcp",
      userId: row.createdByUserId ?? row.ownerUserId,
      userName: null,
      isCurrentUser: false,
      keyId: stored.keyId ?? null,
      keyName: stored.keyName ?? null,
      client: stored.client ?? null,
    };
  }
  const userId = row.createdByUserId ?? row.ownerUserId;
  return {
    kind: "user",
    userId,
    userName: ctx.userNames.get(userId) ?? null,
    isCurrentUser: userId === ctx.actorUserId,
    keyId: null,
    keyName: null,
    client: null,
  };
}

/** Convenience: resolve sources for many rows with one name lookup. */
export async function buildPostSourceDtos<
  T extends { id: string; metadata: unknown; createdByUserId?: string | null },
>(
  rows: T[],
  ctx: { actorUserId: string; ownerUserId: string },
): Promise<Map<string, PostSourceDto>> {
  // Names are only shown for dashboard-created posts.
  const names = await loadUserNames(
    rows.map((r) => {
      const kind = readStoredPostSource(r.metadata)?.kind;
      return kind === "api_key" || kind === "mcp"
        ? null
        : (r.createdByUserId ?? ctx.ownerUserId);
    }),
  );
  const out = new Map<string, PostSourceDto>();
  for (const row of rows) {
    out.set(
      row.id,
      toPostSourceDto(
        { ...row, ownerUserId: ctx.ownerUserId },
        { actorUserId: ctx.actorUserId, userNames: names },
      ),
    );
  }
  return out;
}
