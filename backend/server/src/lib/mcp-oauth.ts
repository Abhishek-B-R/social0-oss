import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { Ratelimit } from "@upstash/ratelimit";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import {
  generateApiKey,
  forgetApiKeysForUser,
  isApiKeyFormat,
  resolveApiKeyById,
  resolveRawApiKey,
} from "./api-keys.js";
import { redis } from "./redis.js";
import { slidingWindowLimiter } from "./ratelimit.js";
import { withRedisTimeout } from "./redis-safe.js";

const MCP_CONNECTOR_KEY_NAME = "MCP Connector";
/** Key names minted by the OAuth connector flow (current + legacy Claude-branded). */
export const MCP_CONNECTOR_KEY_NAMES: readonly string[] = [
  MCP_CONNECTOR_KEY_NAME,
  "Claude MCP Connector",
];

export function isMcpConnectorKeyName(name: string | null | undefined): boolean {
  return !!name && MCP_CONNECTOR_KEY_NAMES.includes(name);
}
const AUTH_CODE_TTL_SECONDS = 300;
/**
 * Access tokens are short-lived bearer credentials; hosts renew them with the
 * refresh token (which rotates on every use). A leaked access token is good
 * for an hour, not a month.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90;
const SESSION_TTL_SECONDS = 900;
/**
 * A registration nobody completes a grant with expires after this. Every token
 * exchange and refresh pushes it out to REFRESH_TOKEN_TTL_SECONDS (see
 * keepMcpOAuthClientAlive), so a client always outlives its live grants.
 */
const CLIENT_TTL_SECONDS = 60 * 60 * 24 * 30;

export const MCP_CLIENT_MAX_REDIRECT_URIS = 10;
export const MCP_CLIENT_MAX_REDIRECT_URI_LENGTH = 2048;
/** client_name is a display label (consent page, agents list, post source). */
export const MCP_CLIENT_NAME_MAX_LENGTH = 80;
const SUPPORTED_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;
const SUPPORTED_RESPONSE_TYPES = ["code"] as const;
/** Must match token_endpoint_auth_methods_supported in getMcpOAuthMetadata. */
const SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS = ["client_secret_post", "none"] as const;

/**
 * /oauth/register and /oauth/authorize are unauthenticated and each call writes
 * a record to the shared Redis, so both are budgeted per caller address (see
 * mcpOAuthCallerBucket). A single app-wide bucket is not enough on its own:
 * one machine could spend it and lock every real host out of connecting.
 *
 * Registration also keeps an app-wide ceiling, set far above real traffic, as
 * the last bound on how fast many addresses together can fill Redis.
 */
export const MCP_CLIENT_REGISTRATIONS_PER_IP_PER_MINUTE = 30;
export const MCP_CLIENT_REGISTRATIONS_PER_MINUTE = 1000;
export const MCP_AUTHORIZE_PER_IP_PER_MINUTE = 60;
export const MCP_AUTHORIZE_PER_CLIENT_PER_MINUTE = 60;

function mcpLimiter(limit: number, prefix: string): Ratelimit | null {
  return slidingWindowLimiter(limit, "1 m", prefix);
}

export const mcpClientRegistrationIpLimiter = mcpLimiter(
  MCP_CLIENT_REGISTRATIONS_PER_IP_PER_MINUTE,
  "rl:mcp_client_register_ip",
);
export const mcpClientRegistrationLimiter = mcpLimiter(
  MCP_CLIENT_REGISTRATIONS_PER_MINUTE,
  "rl:mcp_client_register",
);
/** Key of the app-wide registration ceiling. */
export const MCP_CLIENT_REGISTRATION_LIMIT_KEY = "global";
export const mcpAuthorizeIpLimiter = mcpLimiter(
  MCP_AUTHORIZE_PER_IP_PER_MINUTE,
  "rl:mcp_authorize_ip",
);
export const mcpAuthorizeClientLimiter = mcpLimiter(
  MCP_AUTHORIZE_PER_CLIENT_PER_MINUTE,
  "rl:mcp_authorize_client",
);

/**
 * Connectors reach the OAuth routes through the mcp-worker proxy, so the API
 * sees the worker's address for all of them. The worker forwards the caller's
 * CF-Connecting-IP in this header, signed with MCP_OAUTH_INTROSPECT_SECRET.
 * Keep the names and the signed message in step with
 * cloudflare/mcp-worker/src/auth.ts.
 */
export const MCP_PROXY_CLIENT_IP_HEADER = "x-social0-client-ip";
export const MCP_PROXY_CLIENT_IP_SIGNATURE_HEADER = "x-social0-client-ip-signature";
const MCP_PROXY_CLIENT_IP_CONTEXT = "social0-mcp-client-ip:";

export function signMcpProxyClientIp(ip: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${MCP_PROXY_CLIENT_IP_CONTEXT}${ip}`)
    .digest("base64url");
}

/**
 * The mcp-worker forwards the caller's OAuth access token to `/v1` so the API
 * can act as that user. A token alone is not enough there: `/v1` also wants
 * this header, an HMAC of the token's hash under MCP_OAUTH_INTROSPECT_SECRET,
 * so only the MCP resource server can present OAuth tokens (they are issued
 * for it) and a leaked header cannot be paired with another token. Keep in
 * step with cloudflare/mcp-worker/src/auth.ts.
 */
export const MCP_PROXY_TOKEN_SIGNATURE_HEADER = "x-social0-mcp-proxy";
const MCP_PROXY_TOKEN_CONTEXT = "social0-mcp-proxy:";

export function signMcpProxyToken(token: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${MCP_PROXY_TOKEN_CONTEXT}${hashMcpToken(token)}`)
    .digest("base64url");
}

export function verifyMcpProxyToken(
  token: string,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(signMcpProxyToken(token, secret));
  const provided = Buffer.from(signature);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

/**
 * The address an MCP OAuth request is budgeted under: the proxy-forwarded one
 * when its signature checks out, otherwise the address Fastify resolved
 * (direct calls to the API). Anyone can reach the API directly, so an unsigned
 * or mis-signed header is ignored rather than trusted.
 */
export function resolveMcpOAuthCallerIp(input: {
  headers: Record<string, string | string[] | undefined>;
  ip: string | undefined;
  secret: string | undefined;
}): string | undefined {
  const forwarded = singleHeader(input.headers[MCP_PROXY_CLIENT_IP_HEADER]);
  const signature = singleHeader(input.headers[MCP_PROXY_CLIENT_IP_SIGNATURE_HEADER]);
  if (forwarded && signature && input.secret && isIP(forwarded)) {
    const expected = Buffer.from(signMcpProxyClientIp(forwarded, input.secret));
    const provided = Buffer.from(signature);
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return forwarded;
    }
  }
  return input.ip?.trim() || undefined;
}

/** First four hextets of an IPv6 address, or null when it is not one. */
function ipv6Prefix64(ip: string): string | null {
  if (isIP(ip) !== 6) return null;
  const [head = "", tail] = ip.toLowerCase().split("::");
  const toGroups = (part: string): string[] => {
    if (!part) return [];
    const groups = part.split(":");
    const last = groups[groups.length - 1] ?? "";
    if (last.includes(".")) {
      const octets = last.split(".").map(Number);
      groups.splice(
        -1,
        1,
        (((octets[0] ?? 0) << 8) | (octets[1] ?? 0)).toString(16),
        (((octets[2] ?? 0) << 8) | (octets[3] ?? 0)).toString(16),
      );
    }
    return groups;
  };
  const headGroups = toGroups(head);
  const tailGroups = tail === undefined ? [] : toGroups(tail);
  const fill = Array<string>(8 - headGroups.length - tailGroups.length).fill("0");
  const groups = [...headGroups, ...(tail === undefined ? [] : fill), ...tailGroups];
  return groups
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
    .join(":");
}

/**
 * Rate-limit bucket for a caller address. IPv6 callers share a bucket per /64:
 * one host usually owns the whole prefix and could otherwise take a fresh
 * address, and a fresh budget, for every request. IPv4-mapped IPv6 addresses
 * count as the IPv4 address they carry.
 */
export function mcpOAuthCallerBucket(ip: string | undefined): string {
  if (!ip) return "ip:unknown";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)?.[1];
  if (mapped && isIP(mapped) === 4) return `ip:${mapped}`;
  if (isIP(ip) === 4) return `ip:${ip}`;
  const prefix = ipv6Prefix64(ip);
  return prefix ? `ip6:${prefix}::/64` : "ip:unknown";
}

/**
 * Bounds on what /oauth/authorize copies into its 15-minute session record.
 * A PKCE challenge is 43-128 base64url characters (RFC 7636 §4.1-4.2); state
 * is opaque to us, so it gets more room than scope and resource.
 */
export const MCP_AUTHORIZE_CLIENT_ID_MAX_LENGTH = 128;
export const MCP_AUTHORIZE_STATE_MAX_LENGTH = 1024;
export const MCP_AUTHORIZE_PARAM_MAX_LENGTH = 512;
const PKCE_CODE_CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;

/** Why an /oauth/authorize request's values cannot be stored, or null when they can. */
export function invalidMcpAuthorizeParams(params: {
  clientId: string;
  codeChallenge: string;
  state?: string | undefined;
  scope?: string | undefined;
  resource?: string | undefined;
}): string | null {
  if (params.clientId.length > MCP_AUTHORIZE_CLIENT_ID_MAX_LENGTH) {
    return "client_id is too long";
  }
  if (!PKCE_CODE_CHALLENGE.test(params.codeChallenge)) {
    return "code_challenge must be 43-128 base64url characters";
  }
  if (params.state !== undefined && params.state.length > MCP_AUTHORIZE_STATE_MAX_LENGTH) {
    return `state must be at most ${MCP_AUTHORIZE_STATE_MAX_LENGTH} characters`;
  }
  if (params.scope !== undefined && params.scope.length > MCP_AUTHORIZE_PARAM_MAX_LENGTH) {
    return `scope must be at most ${MCP_AUTHORIZE_PARAM_MAX_LENGTH} characters`;
  }
  if (params.resource !== undefined && params.resource.length > MCP_AUTHORIZE_PARAM_MAX_LENGTH) {
    return `resource must be at most ${MCP_AUTHORIZE_PARAM_MAX_LENGTH} characters`;
  }
  return null;
}

export const MCP_OAUTH_SCOPES = [
  "social0:read",
  "social0:write",
  "me:read",
  "accounts:read",
  "accounts:write",
  "posts:read",
  "posts:write",
  "media:write",
  "jobs:read",
  "analytics:read",
  "inbox:read",
  "inbox:write",
  "webhooks:read",
  "webhooks:write",
] as const;

/** Public origin of the hosted MCP server (the OAuth issuer). */
export function mcpBaseUrl(): string {
  return (process.env.MCP_BASE_URL ?? "https://mcp.social0.app").replace(/\/$/, "");
}

/** The one protected resource these tokens are for (RFC 8707 / RFC 9728). */
export function mcpResourceUrl(): string {
  return `${mcpBaseUrl()}/mcp`;
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hash || url.search) return null;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The resource (RFC 8707) a grant is bound to. A client may name the MCP
 * resource (`…/mcp`) or the MCP origin; either binds to the MCP resource, as
 * does naming none. Anything else is another audience and null
 * (`invalid_target`): these tokens must never be usable there.
 */
export function boundMcpResource(requested: string | undefined): string | null {
  const resource = mcpResourceUrl();
  if (requested === undefined || requested === "") return resource;
  const asked = canonicalUrl(requested);
  if (asked === null) return null;
  return asked === canonicalUrl(resource) || asked === canonicalUrl(mcpBaseUrl())
    ? resource
    : null;
}

/**
 * The scopes a grant gets: the ones requested that this server knows, or all
 * of them when the client asked for none (most MCP hosts send no `scope`).
 * Null when every requested scope is unknown (`invalid_scope`).
 */
export function grantedMcpScopes(requested: string | undefined): string | null {
  const asked = (requested ?? "").split(/\s+/).filter(Boolean);
  if (asked.length === 0) return MCP_OAUTH_SCOPES.join(" ");
  const known = new Set<string>(MCP_OAUTH_SCOPES);
  const granted = MCP_OAUTH_SCOPES.filter((scope) => asked.includes(scope) && known.has(scope));
  return granted.length > 0 ? granted.join(" ") : null;
}

export type McpOAuthClient = {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  client_id_issued_at: number;
};

export type McpOAuthSession = {
  clientId: string;
  clientName?: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scope?: string;
  resource?: string;
};

/**
 * Token records point at the user's connector API key by row id. Postgres
 * keeps only key hashes, and so does Redis now: no raw key and no raw token is
 * stored anywhere (records are keyed by `hashMcpToken`).
 */
type StoredAuthCode = {
  userId: string;
  apiKeyId: string | null;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  /** Epoch ms the user approved this grant; absent on codes minted before it was stored. */
  grantedAt?: number;
  /** Scopes the user approved (`grantedMcpScopes`); absent on older codes, which got all. */
  scope?: string;
  /** Resource the grant is bound to (`boundMcpResource`); absent on older codes. */
  resource?: string;
};

type StoredAccessToken = {
  userId: string;
  apiKeyId: string | null;
  clientId: string;
  /** Registered client_name (e.g. "ChatGPT"); absent on tokens minted before it was stored. */
  clientName?: string;
  scope: string;
  expiresAt: number;
  /**
   * Epoch ms the user approved the grant this token belongs to. Carried
   * unchanged through refreshes. Absent on tokens minted before it was stored,
   * which counts as "granted at 0".
   */
  grantedAt?: number;
  /** Resource (audience) the token is for; absent on older tokens (the MCP resource). */
  resource?: string;
};

type StoredRefreshToken = {
  userId: string;
  apiKeyId: string | null;
  clientId: string;
  clientName?: string;
  scope: string;
  /** `hashMcpToken` of the access token issued with this refresh token. */
  accessTokenHash: string;
  /** See StoredAccessToken.grantedAt. */
  grantedAt?: number;
  /** See StoredAccessToken.resource. */
  resource?: string;
};

/**
 * Fields of records written before keys were hashed: the raw connector key,
 * and (refresh records) the raw access token. Read once, then rewritten.
 */
type LegacyRecordFields = {
  apiKeyRaw?: string;
  accessToken?: string;
};

/** Which OAuth client the user's current connector key was last approved for. */
export type McpConnectorClient = {
  clientId: string;
  clientName: string | null;
  connectedAt: string;
};

function requireRedis() {
  if (!redis) {
    throw new Error("MCP OAuth requires Upstash Redis");
  }
  return redis;
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/** Client secrets are bearer credentials — never compare them with `!==`. */
function matchesClientSecret(
  provided: string | undefined,
  expected: string,
): boolean {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function verifyPkce(codeVerifier: string | undefined, codeChallenge: string): boolean {
  if (!codeVerifier) return false;
  const computed = sha256Base64Url(codeVerifier);
  if (computed.length !== codeChallenge.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(codeChallenge));
}

/** SHA-256 of a bearer token: what Redis keys and records hold instead of it. */
export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenKeyForHash(hash: string): string {
  return `mcp:oauth:token:h:${hash}`;
}

function tokenKey(token: string): string {
  return tokenKeyForHash(hashMcpToken(token));
}

function refreshKey(token: string): string {
  return `mcp:oauth:refresh:h:${hashMcpToken(token)}`;
}

function codeKey(code: string): string {
  return `mcp:oauth:code:h:${hashMcpToken(code)}`;
}

/** Pre-hashing key names, read only to migrate what is still live. */
const legacyKey = {
  token: (token: string) => `mcp:oauth:token:${token}`,
  refresh: (token: string) => `mcp:oauth:refresh:${token}`,
  code: (code: string) => `mcp:oauth:code:${code}`,
};

/**
 * Replace a legacy record's raw connector key with the id of its row, and drop
 * the raw fields. Records already in the current shape pass through.
 */
async function withApiKeyId<T extends { userId: string; apiKeyId: string | null }>(
  record: Omit<T, "apiKeyId"> & { apiKeyId?: string | null } & LegacyRecordFields,
): Promise<T> {
  const { apiKeyRaw, accessToken: _legacyAccessToken, ...rest } = record;
  let apiKeyId: string | null = record.apiKeyId ?? null;
  if (record.apiKeyId === undefined && apiKeyRaw) {
    const auth = await resolveRawApiKey(apiKeyRaw);
    if (auth && auth.userId === record.userId) apiKeyId = auth.apiKeyId;
  }
  // TypeScript cannot follow a generic object rest back to T: `rest` is T
  // without apiKeyId (and without the legacy fields T never had).
  return { ...rest, apiKeyId } as unknown as T;
}

/** GETDEL the hashed record, else the legacy one (single-use codes and refresh tokens). */
async function takeRecord<T>(
  store: NonNullable<typeof redis>,
  key: string,
  legacy: string,
): Promise<(T & LegacyRecordFields) | null> {
  const current = await store.getdel<T & LegacyRecordFields>(key);
  if (current) return current;
  return (await store.getdel<T & LegacyRecordFields>(legacy)) ?? null;
}

/**
 * Read an access token record. One still under its legacy (raw-token) key is
 * moved to the hashed key, with its raw connector key swapped for the key id.
 */
async function readAccessToken(
  store: NonNullable<typeof redis>,
  token: string,
): Promise<StoredAccessToken | null> {
  const current = await store.get<StoredAccessToken>(tokenKey(token));
  if (current) return current;
  const legacy = await store.get<StoredAccessToken & LegacyRecordFields>(legacyKey.token(token));
  if (!legacy) return null;
  const migrated = await withApiKeyId<StoredAccessToken>(legacy);
  const ttl = legacy.expiresAt - Math.floor(Date.now() / 1000);
  if (ttl > 0) await store.set(tokenKey(token), migrated, { ex: ttl });
  await store.del(legacyKey.token(token));
  return migrated;
}

/** Delete an access token by hash, and its legacy key when it had one. */
async function deleteAccessToken(
  store: NonNullable<typeof redis>,
  record: { accessTokenHash?: string; accessToken?: string },
): Promise<void> {
  if (record.accessToken) {
    await store.del(legacyKey.token(record.accessToken));
    await store.del(tokenKey(record.accessToken));
  }
  if (record.accessTokenHash) await store.del(tokenKeyForHash(record.accessTokenHash));
}

function sessionKey(sessionId: string): string {
  return `mcp:oauth:session:${sessionId}`;
}

function consentKey(sessionId: string): string {
  return `mcp:oauth:consent:${sessionId}`;
}

function clientKey(clientId: string): string {
  return `mcp:oauth:client:${clientId}`;
}

/** Latest approved connector client for a user (post source attribution + agents list). */
function connectorClientKey(userId: string): string {
  return `mcp:oauth:connector-client:${userId}`;
}

/**
 * Best-effort: the client the user most recently approved. Only one connector
 * key exists per user, so this names whoever holds it now. Null without Redis.
 */
export async function getMcpConnectorClient(
  userId: string,
): Promise<McpConnectorClient | null> {
  if (!redis) return null;
  const store = redis;
  return withRedisTimeout(
    "mcp-connector-client",
    async () =>
      (await store.get<McpConnectorClient>(connectorClientKey(userId))) ?? null,
    null,
  );
}

/**
 * When the user last revoked the connector from the dashboard (epoch ms; older
 * builds stored an ISO string). Every OAuth grant approved at or before it is
 * dead for good, so it is NOT cleared when the user approves a host again: a
 * later approval only covers the grant it creates.
 *
 * The TTL matches the refresh token's. A grant older than the marker can no
 * longer refresh, so none of its tokens outlive the marker.
 */
function connectorRevokedKey(userId: string): string {
  return `mcp:oauth:connector-revoked:${userId}`;
}

async function getConnectorRevokedAt(
  store: NonNullable<typeof redis>,
  userId: string,
): Promise<number | null> {
  const value = await store.get<string | number>(connectorRevokedKey(userId));
  if (value === null || value === undefined) return null;
  const ms = typeof value === "number" ? value : Date.parse(value);
  // An unreadable marker still means "revoked": at least end unstamped tokens.
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * The user revoked the MCP connector key (AI agents page). Postgres already
 * holds the durable revocation (see resolveOrRotateConnectorApiKey); this
 * records when it happened so no grant approved before it can ever follow the
 * connector to a later key, and forgets the connector's client.
 *
 * Throws when Redis does not take the write, so the caller can tell the user
 * instead of silently reporting success.
 */
export async function markMcpConnectorRevoked(userId: string): Promise<void> {
  if (!redis) return;
  const store = redis;
  const recorded = await withRedisTimeout(
    "mcp-connector-revoke",
    async () => {
      await store.set(connectorRevokedKey(userId), Date.now(), {
        ex: REFRESH_TOKEN_TTL_SECONDS,
      });
      await store.del(connectorRawKey(userId));
      await store.del(connectorClientKey(userId));
      return true;
    },
    false,
  );
  if (!recorded) {
    throw new Error("Could not record the MCP connector revocation");
  }
}

/**
 * Where older builds kept the user's raw connector key. Nothing writes it any
 * more; it is deleted wherever the connector changes so none outlive their TTL.
 */
function connectorRawKey(userId: string): string {
  return `mcp:oauth:connector-raw:${userId}`;
}

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:" && parsed.hostname === "localhost") return true;
    if (parsed.protocol === "http:" && parsed.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

export function validateMcpRedirectUris(redirectUris: string[]): void {
  if (!redirectUris.length) {
    throw new McpClientMetadataError("redirect_uris required");
  }
  for (const uri of redirectUris) {
    if (!isAllowedRedirectUri(uri)) {
      throw new McpClientMetadataError(`Invalid redirect_uri: ${uri}. Use https:// or http://localhost for dev.`);
    }
  }
}

/** Registration metadata the server refuses (RFC 7591 `invalid_client_metadata`). */
export class McpClientMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpClientMetadataError";
  }
}

/** Trimmed, length-capped client_name for display, or undefined. Tolerates legacy records. */
export function displayMcpClientName(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  return name.trim().slice(0, MCP_CLIENT_NAME_MAX_LENGTH) || undefined;
}

function parseEnumList<T extends string>(
  field: string,
  value: unknown,
  supported: readonly T[],
): T[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || !supported.includes(item as T))
  ) {
    throw new McpClientMetadataError(
      `${field} must be a non-empty subset of: ${supported.join(", ")}`,
    );
  }
  return [...new Set(value as T[])];
}

export type McpClientRegistration = {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: (typeof SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS)[number];
  grant_types?: (typeof SUPPORTED_GRANT_TYPES)[number][];
  response_types?: (typeof SUPPORTED_RESPONSE_TYPES)[number][];
};

/**
 * Validate an untrusted registration body and keep only the fields we use, in
 * bounded form. Anything stored here sits in the shared Redis for weeks, so
 * nothing is copied through verbatim. Throws McpClientMetadataError.
 */
export function normalizeMcpClientRegistration(body: unknown): McpClientRegistration {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new McpClientMetadataError("Registration body must be a JSON object");
  }
  const raw = body as Record<string, unknown>;

  const redirectUris = raw.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    throw new McpClientMetadataError("redirect_uris required");
  }
  if (
    redirectUris.length > MCP_CLIENT_MAX_REDIRECT_URIS ||
    redirectUris.some(
      (uri) => typeof uri !== "string" || uri.length > MCP_CLIENT_MAX_REDIRECT_URI_LENGTH,
    )
  ) {
    throw new McpClientMetadataError(
      `Provide at most ${MCP_CLIENT_MAX_REDIRECT_URIS} redirect_uris of up to ${MCP_CLIENT_MAX_REDIRECT_URI_LENGTH} characters each`,
    );
  }
  validateMcpRedirectUris(redirectUris as string[]);

  if (raw.client_name !== undefined && raw.client_name !== null && typeof raw.client_name !== "string") {
    throw new McpClientMetadataError("client_name must be a string");
  }
  const clientName = displayMcpClientName(raw.client_name);

  const authMethod = raw.token_endpoint_auth_method;
  if (
    authMethod !== undefined &&
    authMethod !== null &&
    !SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS.includes(
      authMethod as (typeof SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS)[number],
    )
  ) {
    throw new McpClientMetadataError(
      `token_endpoint_auth_method must be one of: ${SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS.join(", ")}`,
    );
  }

  const grantTypes = parseEnumList("grant_types", raw.grant_types, SUPPORTED_GRANT_TYPES);
  const responseTypes = parseEnumList(
    "response_types",
    raw.response_types,
    SUPPORTED_RESPONSE_TYPES,
  );

  return {
    redirect_uris: [...(redirectUris as string[])],
    ...(clientName ? { client_name: clientName } : {}),
    ...(authMethod
      ? {
          token_endpoint_auth_method:
            authMethod as (typeof SUPPORTED_TOKEN_ENDPOINT_AUTH_METHODS)[number],
        }
      : {}),
    ...(grantTypes ? { grant_types: grantTypes } : {}),
    ...(responseTypes ? { response_types: responseTypes } : {}),
  };
}

export async function registerMcpOAuthClient(input: unknown): Promise<McpOAuthClient> {
  const metadata = normalizeMcpClientRegistration(input);
  const store = requireRedis();
  const clientId = `mcp_${randomBytes(16).toString("hex")}`;
  const clientSecret =
    metadata.token_endpoint_auth_method === "none"
      ? undefined
      : randomBytes(32).toString("base64url");

  const client: McpOAuthClient = {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    redirect_uris: metadata.redirect_uris,
    ...(metadata.client_name ? { client_name: metadata.client_name } : {}),
    token_endpoint_auth_method: metadata.token_endpoint_auth_method ?? "client_secret_post",
    grant_types: metadata.grant_types ?? [...SUPPORTED_GRANT_TYPES],
    response_types: metadata.response_types ?? [...SUPPORTED_RESPONSE_TYPES],
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };

  await store.set(clientKey(clientId), client, { ex: CLIENT_TTL_SECONDS });
  return client;
}

/**
 * A client that just got tokens stays registered as long as the refresh token
 * it now holds. Best-effort: a missed bump only shortens the client's life.
 */
async function keepMcpOAuthClientAlive(
  store: NonNullable<typeof redis>,
  clientId: string,
): Promise<void> {
  await withRedisTimeout(
    "mcp-oauth-client-ttl",
    () => store.expire(clientKey(clientId), REFRESH_TOKEN_TTL_SECONDS),
    0,
  );
}

export async function getMcpOAuthClient(clientId: string): Promise<McpOAuthClient | null> {
  if (!redis) return null;
  return (await redis.get<McpOAuthClient>(clientKey(clientId))) ?? null;
}

export async function createMcpOAuthSession(input: McpOAuthSession): Promise<string> {
  const store = requireRedis();
  const sessionId = randomBytes(24).toString("base64url");
  await store.set(sessionKey(sessionId), input, { ex: SESSION_TTL_SECONDS });
  return sessionId;
}

export async function getMcpOAuthSession(sessionId: string): Promise<McpOAuthSession | null> {
  if (!redis) return null;
  return (await redis.get<McpOAuthSession>(sessionKey(sessionId))) ?? null;
}

export async function getMcpOAuthSessionDetails(sessionId: string): Promise<{
  clientId: string;
  clientName: string;
  redirectUri: string;
} | null> {
  const session = await getMcpOAuthSession(sessionId);
  if (!session) return null;
  const client = await getMcpOAuthClient(session.clientId);
  return {
    clientId: session.clientId,
    clientName:
      displayMcpClientName(client?.client_name) ??
      displayMcpClientName(session.clientName) ??
      "Unknown application",
    redirectUri: session.redirectUri,
  };
}

/** One-time token bound to session + user; required on approve to harden consent CSRF. */
export async function mintMcpConsentToken(
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const store = requireRedis();
  const session = await getMcpOAuthSession(sessionId);
  if (!session) return null;

  const token = randomBytes(24).toString("base64url");
  await store.set(
    consentKey(sessionId),
    { userId, token },
    { ex: SESSION_TTL_SECONDS },
  );
  return token;
}

async function consumeMcpConsentToken(
  sessionId: string,
  userId: string,
  consentToken: string | undefined,
): Promise<boolean> {
  if (!consentToken) return false;
  const store = requireRedis();
  const stored = await store.get<{ userId: string; token: string }>(consentKey(sessionId));
  if (!stored) return false;
  if (stored.userId !== userId) return false;
  if (stored.token.length !== consentToken.length) return false;
  if (!timingSafeEqual(Buffer.from(stored.token), Buffer.from(consentToken))) return false;
  await store.del(consentKey(sessionId));
  return true;
}

/** Mint the user's connector key and return its row id; the raw key is discarded. */
async function createConnectorApiKey(userId: string): Promise<string> {
  // The keys revoked below may be cached as live on this process.
  forgetApiKeysForUser(userId);
  // Also revoke the legacy Claude-branded name from earlier builds.
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.userId, userId),
        eq(apiKeys.name, MCP_CONNECTOR_KEY_NAME),
        isNull(apiKeys.revokedAt),
      ),
    );
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.userId, userId),
        eq(apiKeys.name, "Claude MCP Connector"),
        isNull(apiKeys.revokedAt),
      ),
    );

  // OAuth tokens act through this key by id: nobody ever needs its raw value.
  const { hash, prefix } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId,
      name: MCP_CONNECTOR_KEY_NAME,
      keyHash: hash,
      keyPrefix: prefix,
    })
    .returning({ id: apiKeys.id });
  if (!row) throw new Error("Could not create the MCP connector key");
  if (redis) {
    await redis.del(connectorRawKey(userId)).catch(() => 0);
  }
  return row.id;
}

/**
 * The id of the user's newest connector key row when that row is live.
 * createConnectorApiKey always leaves a fresh live row behind, and a dashboard
 * revoke leaves the newest row revoked, so this tells "replaced by a
 * re-approval" apart from "revoked by the user" from Postgres alone, even if
 * Redis lost the marker.
 */
async function latestLiveConnectorKeyId(userId: string): Promise<string | null> {
  const [latest] = await db
    .select({ id: apiKeys.id, revokedAt: apiKeys.revokedAt, expiresAt: apiKeys.expiresAt })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, userId),
        inArray(apiKeys.name, [...MCP_CONNECTOR_KEY_NAMES]),
      ),
    )
    .orderBy(desc(apiKeys.createdAt))
    .limit(1);
  if (!latest || latest.revokedAt) return null;
  if (latest.expiresAt && latest.expiresAt.getTime() <= Date.now()) return null;
  return latest.id;
}

/**
 * Re-auth rotates the connector API key but a host may still present an older
 * access/refresh token that points at the replaced key. That token may follow
 * the connector to its current key only when all of these hold:
 *
 * - the grant was approved after the user's last dashboard revoke;
 * - it belongs to the OAuth client the user approved most recently (approving
 *   another host cuts the previous one off; it never inherits the new key);
 * - Postgres says the user's newest connector key is live.
 *
 * Otherwise null: introspection answers inactive and refresh fails. Nothing is
 * minted here: the current key is found by id, so its raw value is never
 * needed.
 */
async function resolveOrRotateConnectorApiKey(stored: {
  userId: string;
  apiKeyId: string | null;
  clientId: string;
  grantedAt?: number;
}): Promise<{ apiKeyId: string; rotated: boolean } | null> {
  const { userId, apiKeyId } = stored;
  if (apiKeyId) {
    const auth = await resolveApiKeyById(apiKeyId);
    if (auth && auth.userId === userId) {
      return { apiKeyId, rotated: false };
    }
  }

  const store = requireRedis();

  const revokedAt = await getConnectorRevokedAt(store, userId);
  if (revokedAt !== null && (stored.grantedAt ?? 0) <= revokedAt) {
    return null;
  }

  const connector = await getMcpConnectorClient(userId);
  if (!connector || connector.clientId !== stored.clientId) {
    return null;
  }

  const latestId = await latestLiveConnectorKeyId(userId);
  if (!latestId) return null;
  return { apiKeyId: latestId, rotated: true };
}

export async function denyMcpOAuthSession(sessionId: string): Promise<{
  redirectUrl: string | null;
}> {
  const store = requireRedis();
  const session = await getMcpOAuthSession(sessionId);
  if (!session) {
    return { redirectUrl: null };
  }

  await store.del(sessionKey(sessionId));
  await store.del(consentKey(sessionId));

  const redirect = new URL(session.redirectUri);
  redirect.searchParams.set("error", "access_denied");
  redirect.searchParams.set("error_description", "User denied the connection request");
  if (session.state) redirect.searchParams.set("state", session.state);
  return { redirectUrl: redirect.toString() };
}

export async function approveMcpOAuthSession(
  sessionId: string,
  userId: string,
  consentToken?: string,
): Promise<{ redirectUrl: string }> {
  const store = requireRedis();
  const session = await getMcpOAuthSession(sessionId);
  if (!session) {
    throw new Error("OAuth session expired or not found");
  }

  if (!(await consumeMcpConsentToken(sessionId, userId, consentToken))) {
    throw new Error("Invalid or missing consent token. Reload the page and try again.");
  }

  const client = await getMcpOAuthClient(session.clientId);
  if (!client) {
    throw new Error("Unknown OAuth client");
  }
  if (!client.redirect_uris.includes(session.redirectUri)) {
    throw new Error("Invalid redirect URI");
  }
  const scope = grantedMcpScopes(session.scope);
  if (!scope) {
    throw new Error("None of the requested scopes is supported");
  }
  const resource = boundMcpResource(session.resource);
  if (!resource) {
    throw new Error("The requested resource is not served by this authorization server");
  }

  // Re-approving replaces the previous MCP Connector key so only one
  // active connector credential exists per user (existing host sessions must reconnect).
  // The revoke marker stays: it still ends every grant approved before it.
  const grantedAt = Date.now();
  const apiKeyId = await createConnectorApiKey(userId);
  await store
    .set(
      connectorClientKey(userId),
      {
        clientId: client.client_id,
        clientName: displayMcpClientName(client.client_name) ?? null,
        connectedAt: new Date().toISOString(),
      } satisfies McpConnectorClient,
      { ex: REFRESH_TOKEN_TTL_SECONDS },
    )
    .catch(() => {});
  const code = randomBytes(24).toString("base64url");
  const payload: StoredAuthCode = {
    userId,
    apiKeyId,
    clientId: session.clientId,
    redirectUri: session.redirectUri,
    codeChallenge: session.codeChallenge,
    grantedAt,
    scope,
    resource,
  };

  await store.set(codeKey(code), payload, { ex: AUTH_CODE_TTL_SECONDS });
  await store.del(sessionKey(sessionId));

  const redirect = new URL(session.redirectUri);
  redirect.searchParams.set("code", code);
  if (session.state) redirect.searchParams.set("state", session.state);
  return { redirectUrl: redirect.toString() };
}

/**
 * RFC 8707 §2.2: a `resource` sent to the token endpoint must be one the
 * grant was bound to. Older grants carry none and count as the MCP resource.
 */
function resourceMatchesGrant(requested: string | undefined, bound: string | undefined): boolean {
  if (requested === undefined || requested === "") return true;
  return boundMcpResource(requested) === (bound ?? mcpResourceUrl());
}

export async function exchangeMcpAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  codeVerifier?: string;
  resource?: string;
}): Promise<{
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}> {
  const store = requireRedis();
  const client = await getMcpOAuthClient(input.clientId);
  if (!client) {
    throw new Error("invalid_client");
  }

  if (client.client_secret) {
    if (!matchesClientSecret(input.clientSecret, client.client_secret)) {
      throw new Error("invalid_client");
    }
  }

  // Claim the code before validating the rest of the request. Read-then-delete
  // let two concurrent exchanges both pass their checks and each walk away with
  // a token pair; an authorization code is single-use (RFC 6749 §4.1.2), and
  // GETDEL is the only way to say that atomically. The client has already
  // proved its identity above, so a failed attempt burning the code is the
  // intended outcome rather than something an outsider can trigger.
  const taken = await takeRecord<StoredAuthCode>(
    store,
    codeKey(input.code),
    legacyKey.code(input.code),
  );
  if (!taken) {
    throw new Error("invalid_grant");
  }
  const stored = await withApiKeyId<StoredAuthCode>(taken);
  if (stored.clientId !== input.clientId) {
    throw new Error("invalid_grant");
  }
  if (input.redirectUri !== stored.redirectUri) {
    throw new Error("invalid_grant");
  }
  if (!verifyPkce(input.codeVerifier, stored.codeChallenge)) {
    throw new Error("invalid_grant");
  }
  if (!resourceMatchesGrant(input.resource, stored.resource)) {
    throw new Error("invalid_target");
  }
  const resource = stored.resource ?? mcpResourceUrl();

  const accessToken = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;
  // What the user approved; a code from before scopes were stored got all.
  const scope = stored.scope ?? MCP_OAUTH_SCOPES.join(" ");

  const clientName = displayMcpClientName(client.client_name);
  const grantedAt = stored.grantedAt ?? Date.now();
  const tokenPayload: StoredAccessToken = {
    userId: stored.userId,
    apiKeyId: stored.apiKeyId,
    clientId: input.clientId,
    ...(clientName ? { clientName } : {}),
    scope,
    expiresAt,
    grantedAt,
    resource,
  };

  await store.set(tokenKey(accessToken), tokenPayload, { ex: ACCESS_TOKEN_TTL_SECONDS });
  await store.set(
    refreshKey(refreshToken),
    {
      userId: stored.userId,
      apiKeyId: stored.apiKeyId,
      clientId: input.clientId,
      ...(clientName ? { clientName } : {}),
      scope,
      accessTokenHash: hashMcpToken(accessToken),
      grantedAt,
      resource,
    } satisfies StoredRefreshToken,
    { ex: REFRESH_TOKEN_TTL_SECONDS },
  );
  await keepMcpOAuthClientAlive(store, input.clientId);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope,
  };
}

export async function refreshMcpAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
  resource?: string;
}): Promise<{
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}> {
  const store = requireRedis();
  const client = await getMcpOAuthClient(input.clientId);
  if (!client) throw new Error("invalid_client");
  if (
    client.client_secret &&
    !matchesClientSecret(input.clientSecret, client.client_secret)
  ) {
    throw new Error("invalid_client");
  }

  // Claim the refresh token atomically, like the code exchange does. With a
  // read then a delete, two concurrent refreshes with the same token both
  // passed and each minted its own token pair, forking the grant.
  const taken = await takeRecord<StoredRefreshToken>(
    store,
    refreshKey(input.refreshToken),
    legacyKey.refresh(input.refreshToken),
  );
  if (!taken || taken.clientId !== input.clientId) {
    throw new Error("invalid_grant");
  }

  await deleteAccessToken(store, taken);
  const stored = await withApiKeyId<Omit<StoredRefreshToken, "accessTokenHash">>(taken);
  // The refresh token is spent either way: a client asking for another
  // audience gets nothing, and must not keep a usable grant by retrying.
  if (!resourceMatchesGrant(input.resource, stored.resource)) {
    throw new Error("invalid_target");
  }
  const resource = stored.resource ?? mcpResourceUrl();

  const resolved = await resolveOrRotateConnectorApiKey(stored);
  if (!resolved) throw new Error("invalid_grant");
  const { apiKeyId } = resolved;
  const refreshedClientName =
    stored.clientName ?? displayMcpClientName(client.client_name);

  const accessToken = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;

  await store.set(
    tokenKey(accessToken),
    {
      userId: stored.userId,
      apiKeyId,
      clientId: input.clientId,
      ...(refreshedClientName ? { clientName: refreshedClientName } : {}),
      scope: stored.scope,
      expiresAt,
      ...(stored.grantedAt !== undefined ? { grantedAt: stored.grantedAt } : {}),
      resource,
    } satisfies StoredAccessToken,
    { ex: ACCESS_TOKEN_TTL_SECONDS },
  );
  await store.set(
    refreshKey(refreshToken),
    {
      userId: stored.userId,
      apiKeyId,
      clientId: input.clientId,
      ...(refreshedClientName ? { clientName: refreshedClientName } : {}),
      scope: stored.scope,
      accessTokenHash: hashMcpToken(accessToken),
      ...(stored.grantedAt !== undefined ? { grantedAt: stored.grantedAt } : {}),
      resource,
    } satisfies StoredRefreshToken,
    { ex: REFRESH_TOKEN_TTL_SECONDS },
  );
  await keepMcpOAuthClientAlive(store, input.clientId);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: stored.scope,
  };
}

export async function revokeMcpToken(input: {
  token: string;
  clientId?: string;
  clientSecret?: string;
  tokenTypeHint?: string;
}): Promise<void> {
  const store = requireRedis();

  // RFC 7009: always succeed from the client's perspective; authenticate when possible.
  if (input.clientId) {
    const client = await getMcpOAuthClient(input.clientId);
    if (!client) return;
    if (client.client_secret) {
      if (!matchesClientSecret(input.clientSecret, client.client_secret)) {
        throw new Error("invalid_client");
      }
    }
  }

  const tryRevokeAccess = async () => {
    const access = await readAccessToken(store, input.token);
    if (!access) return false;
    if (input.clientId && access.clientId !== input.clientId) return false;
    await store.del(tokenKey(input.token));
    await store.del(legacyKey.token(input.token));
    return true;
  };

  const tryRevokeRefresh = async () => {
    const refresh =
      (await store.get<StoredRefreshToken & LegacyRecordFields>(refreshKey(input.token))) ??
      (await store.get<StoredRefreshToken & LegacyRecordFields>(legacyKey.refresh(input.token)));
    if (!refresh) return false;
    if (input.clientId && refresh.clientId !== input.clientId) return false;
    await store.del(refreshKey(input.token));
    await store.del(legacyKey.refresh(input.token));
    await deleteAccessToken(store, refresh);
    return true;
  };

  if (input.tokenTypeHint === "refresh_token") {
    if (await tryRevokeRefresh()) return;
    await tryRevokeAccess();
    return;
  }

  if (await tryRevokeAccess()) return;
  await tryRevokeRefresh();
}

/** A live OAuth access token: who it acts for, through which key, with what scope. */
export type McpAccessTokenAuth = {
  userId: string;
  apiKeyId: string;
  clientId: string;
  clientName?: string;
  scope: string;
  expiresAt: number;
  /** The token's audience; older tokens without one are for the MCP resource. */
  resource: string;
};

/**
 * Resolve an OAuth access token to the user and connector key it acts
 * through, healing it onto the user's current connector key when the rules in
 * `resolveOrRotateConnectorApiKey` allow. Null when the token is unknown,
 * expired, or its grant is dead.
 */
export async function resolveMcpAccessTokenAuth(
  token: string,
): Promise<McpAccessTokenAuth | null> {
  if (!redis) return null;
  const store = redis;
  const stored = await readAccessToken(store, token);
  if (!stored) return null;
  if (stored.expiresAt <= Math.floor(Date.now() / 1000)) return null;

  const resolved = await resolveOrRotateConnectorApiKey(stored);
  if (!resolved) return null;

  if (resolved.rotated) {
    const ttl = Math.max(1, stored.expiresAt - Math.floor(Date.now() / 1000));
    await store.set(
      tokenKey(token),
      { ...stored, apiKeyId: resolved.apiKeyId } satisfies StoredAccessToken,
      { ex: ttl },
    );
  }

  return {
    userId: stored.userId,
    apiKeyId: resolved.apiKeyId,
    clientId: stored.clientId,
    ...(stored.clientName ? { clientName: stored.clientName } : {}),
    scope: stored.scope,
    expiresAt: stored.expiresAt,
    resource: stored.resource ?? mcpResourceUrl(),
  };
}

/**
 * Token introspection for the mcp-worker. Answers whether the bearer token is
 * live and what it may do. It never returns a credential: the worker forwards
 * the caller's own token to `/v1` (signed, see `signMcpProxyToken`).
 */
export async function introspectMcpAccessToken(token: string): Promise<{
  active: boolean;
  scope?: string;
  client_id?: string;
  /** Registered OAuth client_name when known; MCP hosts may forward it as `X-Social0-Mcp-Client`. */
  client_name?: string;
  exp?: number;
}> {
  if (!redis) return { active: false };

  if (isApiKeyFormat(token)) {
    const auth = await resolveRawApiKey(token);
    if (!auth) return { active: false };
    return { active: true, scope: MCP_OAUTH_SCOPES.join(" ") };
  }

  const auth = await resolveMcpAccessTokenAuth(token);
  if (!auth) return { active: false };
  return {
    active: true,
    scope: auth.scope,
    client_id: auth.clientId,
    ...(auth.clientName ? { client_name: auth.clientName } : {}),
    exp: auth.expiresAt,
  };
}

export function getMcpOAuthMetadata(baseUrl: string) {
  const issuer = baseUrl.replace(/\/$/, "");
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: [...MCP_OAUTH_SCOPES],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: "https://social0.app/mcp",
  };
}

export function getMcpProtectedResourceMetadata(baseUrl: string) {
  const resource = `${baseUrl.replace(/\/$/, "")}/mcp`;
  return {
    resource,
    authorization_servers: [baseUrl.replace(/\/$/, "")],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Social0 MCP",
    resource_documentation: "https://social0.app/mcp",
    resource_policy_uri: "https://social0.app/privacy",
    resource_tos_uri: "https://social0.app/terms",
    // Directory / connector branding
    resource_icon: "https://social0.app/logo.png",
  };
}

export function verifyMcpIntrospectSecret(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
