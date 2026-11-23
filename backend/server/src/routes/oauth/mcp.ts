import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../lib/env.js";
import {
  approveMcpOAuthSession,
  createMcpOAuthSession,
  denyMcpOAuthSession,
  displayMcpClientName,
  exchangeMcpAuthorizationCode,
  getMcpOAuthClient,
  getMcpOAuthMetadata,
  getMcpOAuthSessionDetails,
  getMcpProtectedResourceMetadata,
  boundMcpResource,
  grantedMcpScopes,
  introspectMcpAccessToken,
  mcpBaseUrl,
  invalidMcpAuthorizeParams,
  MCP_CLIENT_REGISTRATION_LIMIT_KEY,
  mcpAuthorizeClientLimiter,
  mcpAuthorizeIpLimiter,
  McpClientMetadataError,
  type McpClientRegistration,
  mcpClientRegistrationIpLimiter,
  mcpClientRegistrationLimiter,
  mcpOAuthCallerBucket,
  mintMcpConsentToken,
  normalizeMcpClientRegistration,
  refreshMcpAccessToken,
  registerMcpOAuthClient,
  resolveMcpOAuthCallerIp,
  revokeMcpToken,
  verifyMcpIntrospectSecret,
} from "../../lib/mcp-oauth.js";
import { enforceRateLimit, type RateLimitResult } from "../../lib/ratelimit.js";
import { requireSessionUserId } from "../../middleware/auth.js";
import { getAuthApiBaseUrl } from "../../lib/env.js";
import { getApiProtectedResourceMetadata } from "../../lib/api-scopes.js";

/** Same cap the mcp-worker proxy applies; a valid registration is a few KB at most. */
const REGISTER_BODY_LIMIT_BYTES = 64 * 1024;

function oauthError(reply: FastifyReply, error: string, description?: string, status = 400) {
  return reply.status(status).send({
    error,
    ...(description ? { error_description: description } : {}),
  });
}

/** Rate-limit bucket for the caller of an unauthenticated MCP OAuth route. */
function callerBucket(request: FastifyRequest): string {
  return mcpOAuthCallerBucket(
    resolveMcpOAuthCallerIp({
      headers: request.headers,
      ip: request.ip,
      secret: process.env.MCP_OAUTH_INTROSPECT_SECRET,
    }),
  );
}

/** First budget the request does not fit in, or null when it fits all of them. */
async function spendBudgets(
  budgets: ReadonlyArray<readonly [Parameters<typeof enforceRateLimit>[0], string]>,
): Promise<Extract<RateLimitResult, { allowed: false }> | null> {
  for (const [limiter, key] of budgets) {
    const budget = await enforceRateLimit(limiter, key);
    if (!budget.allowed) return budget;
  }
  return null;
}

function rateLimited(
  reply: FastifyReply,
  budget: Extract<RateLimitResult, { allowed: false }>,
) {
  if (budget.reset) {
    const retryAfter = Math.max(1, Math.ceil((budget.reset - Date.now()) / 1000));
    reply.header("Retry-After", String(retryAfter));
  }
  return oauthError(reply, "temporarily_unavailable", budget.error, budget.status);
}

function parseFormBody(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export async function registerMcpOAuthRoutes(app: FastifyInstance) {
  const baseUrl = mcpBaseUrl();

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      try {
        const parsed = Object.fromEntries(new URLSearchParams(body as string));
        done(null, parsed);
      } catch (error) {
        done(error as Error);
      }
    },
  );

  app.get("/.well-known/oauth-authorization-server", async (_request, reply) => {
    return reply.send(getMcpOAuthMetadata(baseUrl));
  });

  app.get("/.well-known/oauth-protected-resource", async (_request, reply) => {
    return reply.send(getApiProtectedResourceMetadata(getAuthApiBaseUrl()));
  });

  app.get("/.well-known/oauth-protected-resource/mcp", async (_request, reply) => {
    return reply.send(getMcpProtectedResourceMetadata(baseUrl));
  });

  app.get("/oauth/mcp/metadata", async (_request, reply) => {
    return reply.send({
      oauth: getMcpOAuthMetadata(baseUrl),
      resource: getMcpProtectedResourceMetadata(baseUrl),
    });
  });

  app.get("/oauth/authorize", async (request, reply) => {
    const rawQuery = (request.query ?? {}) as Record<string, unknown>;
    // A repeated key parses to an array (RFC 6749 §3.1 forbids repeats), and
    // an array must never reach the session record or the redirect.
    if (Object.values(rawQuery).some((value) => typeof value !== "string")) {
      return oauthError(reply, "invalid_request", "Each parameter may appear only once");
    }
    const query = rawQuery as Record<string, string | undefined>;
    const clientId = query.client_id;
    const redirectUri = query.redirect_uri;
    const codeChallenge = query.code_challenge;
    const responseType = query.response_type ?? "code";
    const state = query.state;
    const scope = query.scope;
    const resource = query.resource;

    if (!clientId || !redirectUri || !codeChallenge) {
      return oauthError(reply, "invalid_request", "client_id, redirect_uri, and code_challenge are required");
    }
    if (responseType !== "code") {
      return oauthError(reply, "unsupported_response_type");
    }
    if (query.code_challenge_method && query.code_challenge_method !== "S256") {
      return oauthError(reply, "invalid_request", "Only S256 PKCE is supported");
    }
    // Everything below is copied into a Redis session record, so it is bounded
    // before any Redis call is spent on the request.
    const invalid = invalidMcpAuthorizeParams({ clientId, codeChallenge, state, scope, resource });
    if (invalid) {
      return oauthError(reply, "invalid_request", invalid);
    }
    if (grantedMcpScopes(scope) === null) {
      return oauthError(reply, "invalid_scope", "None of the requested scopes is supported");
    }
    if (boundMcpResource(resource) === null) {
      return oauthError(
        reply,
        "invalid_target",
        "resource must be this server's MCP resource",
      );
    }

    const callerBlocked = await spendBudgets([[mcpAuthorizeIpLimiter, callerBucket(request)]]);
    if (callerBlocked) return rateLimited(reply, callerBlocked);

    const client = await getMcpOAuthClient(clientId);
    if (!client) {
      return oauthError(reply, "invalid_client", undefined, 401);
    }
    if (!client.redirect_uris.includes(redirectUri)) {
      return oauthError(reply, "invalid_request", "redirect_uri is not registered for this client");
    }

    // Per client too, so many addresses cannot pile sessions onto one client.
    const clientBlocked = await spendBudgets([[mcpAuthorizeClientLimiter, `client:${clientId}`]]);
    if (clientBlocked) return rateLimited(reply, clientBlocked);

    const clientName = displayMcpClientName(client.client_name);
    try {
      const sessionId = await createMcpOAuthSession({
        clientId,
        redirectUri,
        codeChallenge,
        ...(clientName ? { clientName } : {}),
        ...(state ? { state } : {}),
        ...(scope ? { scope } : {}),
        ...(resource ? { resource } : {}),
      });

      const connectUrl = new URL(`${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/oauth/mcp/connect`);
      connectUrl.searchParams.set("session", sessionId);
      return reply.redirect(connectUrl.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth unavailable";
      return oauthError(reply, "server_error", message, 503);
    }
  });

  // Dynamic client registration is unauthenticated by design (RFC 7591). It is
  // budgeted per caller address (the mcp-worker proxy forwards it signed), so
  // one machine cannot spend the budget every real host needs to connect; the
  // app-wide ceiling sits far above real traffic. The lib stores only
  // validated, bounded metadata, because this route is also reachable directly.
  app.post(
    "/oauth/register",
    { bodyLimit: REGISTER_BODY_LIMIT_BYTES },
    async (request, reply) => {
      let metadata: McpClientRegistration;
      try {
        metadata = normalizeMcpClientRegistration(request.body);
      } catch (error) {
        if (error instanceof McpClientMetadataError) {
          return oauthError(reply, "invalid_client_metadata", error.message);
        }
        throw error;
      }

      // Caller first: a caller over its own budget never draws on the ceiling.
      const blocked = await spendBudgets([
        [mcpClientRegistrationIpLimiter, callerBucket(request)],
        [mcpClientRegistrationLimiter, MCP_CLIENT_REGISTRATION_LIMIT_KEY],
      ]);
      if (blocked) return rateLimited(reply, blocked);

      try {
        const client = await registerMcpOAuthClient(metadata);
        return reply.status(201).send(client);
      } catch (error) {
        if (error instanceof McpClientMetadataError) {
          return oauthError(reply, "invalid_client_metadata", error.message);
        }
        const message = error instanceof Error ? error.message : "Registration failed";
        return oauthError(reply, "server_error", message, 503);
      }
    },
  );

  app.post("/oauth/token", async (request, reply) => {
    const body = parseFormBody(request.body);
    const grantType = body.grant_type;

    try {
      if (grantType === "authorization_code") {
        if (!body.code || !body.client_id || !body.redirect_uri) {
          return oauthError(reply, "invalid_request", "code, client_id, and redirect_uri required");
        }
        const tokens = await exchangeMcpAuthorizationCode({
          code: body.code,
          clientId: body.client_id,
          redirectUri: body.redirect_uri,
          ...(body.client_secret ? { clientSecret: body.client_secret } : {}),
          ...(body.code_verifier ? { codeVerifier: body.code_verifier } : {}),
          ...(body.resource ? { resource: body.resource } : {}),
        });
        return reply.send(tokens);
      }

      if (grantType === "refresh_token") {
        if (!body.refresh_token || !body.client_id) {
          return oauthError(reply, "invalid_request", "refresh_token and client_id required");
        }
        const tokens = await refreshMcpAccessToken({
          refreshToken: body.refresh_token,
          clientId: body.client_id,
          ...(body.client_secret ? { clientSecret: body.client_secret } : {}),
          ...(body.resource ? { resource: body.resource } : {}),
        });
        return reply.send(tokens);
      }

      return oauthError(reply, "unsupported_grant_type");
    } catch (error) {
      const message = error instanceof Error ? error.message : "token_error";
      if (message === "invalid_client") {
        return oauthError(reply, "invalid_client", undefined, 401);
      }
      if (message === "invalid_grant") {
        return oauthError(reply, "invalid_grant", undefined, 400);
      }
      if (message === "invalid_target") {
        return oauthError(reply, "invalid_target", undefined, 400);
      }
      return oauthError(reply, "server_error", message, 503);
    }
  });

  app.post("/oauth/revoke", async (request, reply) => {
    const body = parseFormBody(request.body);
    if (!body.token) {
      return oauthError(reply, "invalid_request", "token required");
    }

    try {
      await revokeMcpToken({
        token: body.token,
        ...(body.client_id ? { clientId: body.client_id } : {}),
        ...(body.client_secret ? { clientSecret: body.client_secret } : {}),
        ...(body.token_type_hint ? { tokenTypeHint: body.token_type_hint } : {}),
      });
      // RFC 7009: revocation always returns 200 with empty body on success
      return reply.status(200).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : "revoke_error";
      if (message === "invalid_client") {
        return oauthError(reply, "invalid_client", undefined, 401);
      }
      return oauthError(reply, "server_error", message, 503);
    }
  });

  app.post("/oauth/mcp/introspect", async (request, reply) => {
    const secret = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!verifyMcpIntrospectSecret(secret, process.env.MCP_OAUTH_INTROSPECT_SECRET)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const body = request.body as { token?: string };
    if (!body.token) {
      return reply.status(400).send({ error: "token required" });
    }

    const result = await introspectMcpAccessToken(body.token);
    return reply.send(result);
  });

  app.get("/api/oauth/mcp/session", async (request, reply) => {
    const query = request.query as { session?: string };
    if (!query.session) {
      return reply.status(400).send({ error: "session required" });
    }

    const details = await getMcpOAuthSessionDetails(query.session);
    if (!details) {
      return reply.status(404).send({ error: "OAuth session expired or not found" });
    }

    const userId = await requireSessionUserId(request);
    if (userId) {
      try {
        const consentToken = await mintMcpConsentToken(query.session, userId);
        if (consentToken) {
          return reply.send({ ...details, consentToken });
        }
      } catch {
        // Redis unavailable — fall through without consent token (approve will fail closed)
      }
    }

    return reply.send(details);
  });

  app.post("/api/oauth/mcp/approve", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const body = request.body as { session?: string; consentToken?: string };
    if (!body.session) {
      return reply.status(400).send({ error: "session required" });
    }

    try {
      const result = await approveMcpOAuthSession(body.session, userId, body.consentToken);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approval failed";
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/api/oauth/mcp/deny", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const body = request.body as { session?: string };
    if (!body.session) {
      return reply.status(400).send({ error: "session required" });
    }

    try {
      const result = await denyMcpOAuthSession(body.session);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Deny failed";
      return reply.status(400).send({ error: message });
    }
  });
}

export async function registerMcpOAuthPublicRoutes(app: FastifyInstance) {
  await app.register(registerMcpOAuthRoutes);
}
