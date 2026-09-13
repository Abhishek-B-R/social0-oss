import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { generateApiKey, isApiKeyFormat, resolveRawApiKey } from "./api-keys.js";
import { redis } from "./redis.js";

const MCP_CONNECTOR_KEY_NAME = "MCP Connector";
const AUTH_CODE_TTL_SECONDS = 300;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90;
const SESSION_TTL_SECONDS = 900;
const CLIENT_TTL_SECONDS = 60 * 60 * 24 * 365;

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

type StoredAuthCode = {
  userId: string;
  apiKeyRaw: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
};

type StoredAccessToken = {
  userId: string;
  apiKeyRaw: string;
  clientId: string;
  scope: string;
  expiresAt: number;
};

type StoredRefreshToken = {
  userId: string;
  apiKeyRaw: string;
  clientId: string;
  scope: string;
  accessToken: string;
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

function tokenKey(token: string): string {
  return `mcp:oauth:token:${token}`;
}

function refreshKey(token: string): string {
  return `mcp:oauth:refresh:${token}`;
}

function codeKey(code: string): string {
  return `mcp:oauth:code:${code}`;
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

/** Latest raw connector key for a user — lets stale OAuth tokens heal after re-auth. */
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
    throw new Error("redirect_uris required");
  }
  for (const uri of redirectUris) {
    if (!isAllowedRedirectUri(uri)) {
      throw new Error(`Invalid redirect_uri: ${uri}. Use https:// or http://localhost for dev.`);
    }
  }
}

export async function registerMcpOAuthClient(input: {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
}): Promise<McpOAuthClient> {
  validateMcpRedirectUris(input.redirect_uris);
  const store = requireRedis();
  const clientId = `mcp_${randomBytes(16).toString("hex")}`;
  const clientSecret =
    input.token_endpoint_auth_method === "none"
      ? undefined
      : randomBytes(32).toString("base64url");

  const client: McpOAuthClient = {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    redirect_uris: input.redirect_uris,
    ...(input.client_name ? { client_name: input.client_name } : {}),
    token_endpoint_auth_method: input.token_endpoint_auth_method ?? "client_secret_post",
    grant_types: input.grant_types ?? ["authorization_code", "refresh_token"],
    response_types: input.response_types ?? ["code"],
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };

  await store.set(clientKey(clientId), client, { ex: CLIENT_TTL_SECONDS });
  return client;
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
    clientName: client?.client_name ?? session.clientName ?? "Unknown application",
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

async function createConnectorApiKey(userId: string): Promise<string> {
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

  const { raw, hash, prefix } = generateApiKey();
  await db.insert(apiKeys).values({
    userId,
    name: MCP_CONNECTOR_KEY_NAME,
    keyHash: hash,
    keyPrefix: prefix,
  });
  // Keep raw available so older access tokens can heal after connector rotation.
  if (redis) {
    await redis.set(connectorRawKey(userId), raw, {
      ex: REFRESH_TOKEN_TTL_SECONDS,
    });
  }
  return raw;
}

/**
 * Re-auth rotates the connector API key but a host may still present an older
 * access/refresh token that embeds the revoked raw key. Prefer the latest
 * connector raw from Redis; mint only if that is also gone.
 */
async function resolveOrRotateConnectorApiKey(
  userId: string,
  apiKeyRaw: string,
): Promise<{ apiKeyRaw: string; rotated: boolean }> {
  const auth = await resolveRawApiKey(apiKeyRaw);
  if (auth && auth.userId === userId) {
    return { apiKeyRaw, rotated: false };
  }

  if (redis) {
    const latest = await redis.get<string>(connectorRawKey(userId));
    if (typeof latest === "string" && latest.length > 0) {
      const latestAuth = await resolveRawApiKey(latest);
      if (latestAuth && latestAuth.userId === userId) {
        return { apiKeyRaw: latest, rotated: true };
      }
    }
  }

  const rotated = await createConnectorApiKey(userId);
  return { apiKeyRaw: rotated, rotated: true };
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

  // Re-approving replaces the previous MCP Connector key so only one
  // active connector credential exists per user (existing host sessions must reconnect).
  const apiKeyRaw = await createConnectorApiKey(userId);
  const code = randomBytes(24).toString("base64url");
  const payload: StoredAuthCode = {
    userId,
    apiKeyRaw,
    clientId: session.clientId,
    redirectUri: session.redirectUri,
    codeChallenge: session.codeChallenge,
  };

  await store.set(codeKey(code), payload, { ex: AUTH_CODE_TTL_SECONDS });
  await store.del(sessionKey(sessionId));

  const redirect = new URL(session.redirectUri);
  redirect.searchParams.set("code", code);
  if (session.state) redirect.searchParams.set("state", session.state);
  return { redirectUrl: redirect.toString() };
}

export async function exchangeMcpAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  codeVerifier?: string;
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
  const stored = await store.getdel<StoredAuthCode>(codeKey(input.code));
  if (!stored) {
    throw new Error("invalid_grant");
  }
  if (stored.clientId !== input.clientId) {
    throw new Error("invalid_grant");
  }
  if (input.redirectUri !== stored.redirectUri) {
    throw new Error("invalid_grant");
  }
  if (!verifyPkce(input.codeVerifier, stored.codeChallenge)) {
    throw new Error("invalid_grant");
  }

  const accessToken = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;
  const scope = MCP_OAUTH_SCOPES.join(" ");

  const tokenPayload: StoredAccessToken = {
    userId: stored.userId,
    apiKeyRaw: stored.apiKeyRaw,
    clientId: input.clientId,
    scope,
    expiresAt,
  };

  await store.set(tokenKey(accessToken), tokenPayload, { ex: ACCESS_TOKEN_TTL_SECONDS });
  await store.set(
    refreshKey(refreshToken),
    {
      userId: stored.userId,
      apiKeyRaw: stored.apiKeyRaw,
      clientId: input.clientId,
      scope,
      accessToken,
    } satisfies StoredRefreshToken,
    { ex: REFRESH_TOKEN_TTL_SECONDS },
  );

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

  const stored = await store.get<StoredRefreshToken>(refreshKey(input.refreshToken));
  if (!stored || stored.clientId !== input.clientId) {
    throw new Error("invalid_grant");
  }

  await store.del(refreshKey(input.refreshToken));
  await store.del(tokenKey(stored.accessToken));

  const { apiKeyRaw } = await resolveOrRotateConnectorApiKey(
    stored.userId,
    stored.apiKeyRaw,
  );

  const accessToken = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;

  await store.set(
    tokenKey(accessToken),
    {
      userId: stored.userId,
      apiKeyRaw,
      clientId: input.clientId,
      scope: stored.scope,
      expiresAt,
    } satisfies StoredAccessToken,
    { ex: ACCESS_TOKEN_TTL_SECONDS },
  );
  await store.set(
    refreshKey(refreshToken),
    {
      userId: stored.userId,
      apiKeyRaw,
      clientId: input.clientId,
      scope: stored.scope,
      accessToken,
    } satisfies StoredRefreshToken,
    { ex: REFRESH_TOKEN_TTL_SECONDS },
  );

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
    const access = await store.get<StoredAccessToken>(tokenKey(input.token));
    if (!access) return false;
    if (input.clientId && access.clientId !== input.clientId) return false;
    await store.del(tokenKey(input.token));
    return true;
  };

  const tryRevokeRefresh = async () => {
    const refresh = await store.get<StoredRefreshToken>(refreshKey(input.token));
    if (!refresh) return false;
    if (input.clientId && refresh.clientId !== input.clientId) return false;
    await store.del(refreshKey(input.token));
    await store.del(tokenKey(refresh.accessToken));
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

export async function introspectMcpAccessToken(token: string): Promise<{
  active: boolean;
  scope?: string;
  client_id?: string;
  exp?: number;
  api_key?: string;
}> {
  if (!redis) return { active: false };

  if (isApiKeyFormat(token)) {
    const auth = await resolveRawApiKey(token);
    if (!auth) return { active: false };
    return {
      active: true,
      scope: MCP_OAUTH_SCOPES.join(" "),
      api_key: token,
    };
  }

  const stored = await redis.get<StoredAccessToken>(tokenKey(token));
  if (!stored) return { active: false };
  if (stored.expiresAt <= Math.floor(Date.now() / 1000)) return { active: false };

  const { apiKeyRaw, rotated } = await resolveOrRotateConnectorApiKey(
    stored.userId,
    stored.apiKeyRaw,
  );

  if (rotated) {
    const ttl = Math.max(1, stored.expiresAt - Math.floor(Date.now() / 1000));
    await redis.set(
      tokenKey(token),
      { ...stored, apiKeyRaw } satisfies StoredAccessToken,
      { ex: ttl },
    );
  }

  return {
    active: true,
    scope: stored.scope,
    client_id: stored.clientId,
    exp: stored.expiresAt,
    api_key: apiKeyRaw,
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
