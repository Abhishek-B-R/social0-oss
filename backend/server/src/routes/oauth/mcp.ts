import type { FastifyInstance, FastifyReply } from "fastify";
import { env } from "../../lib/env.js";
import {
  approveMcpOAuthSession,
  createMcpOAuthSession,
  denyMcpOAuthSession,
  exchangeMcpAuthorizationCode,
  getMcpOAuthClient,
  getMcpOAuthMetadata,
  getMcpOAuthSessionDetails,
  getMcpProtectedResourceMetadata,
  introspectMcpAccessToken,
  mintMcpConsentToken,
  refreshMcpAccessToken,
  registerMcpOAuthClient,
  revokeMcpToken,
  verifyMcpIntrospectSecret,
} from "../../lib/mcp-oauth.js";
import { requireSessionUserId } from "../../middleware/auth.js";
import { getAuthApiBaseUrl } from "../../lib/env.js";
import { getApiProtectedResourceMetadata } from "../../lib/api-scopes.js";

function mcpBaseUrl(): string {
  return (process.env.MCP_BASE_URL ?? "https://mcp.social0.app").replace(/\/$/, "");
}

function oauthError(reply: FastifyReply, error: string, description?: string, status = 400) {
  return reply.status(status).send({
    error,
    ...(description ? { error_description: description } : {}),
  });
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
    const query = request.query as Record<string, string | undefined>;
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

    const client = await getMcpOAuthClient(clientId);
    if (!client) {
      return oauthError(reply, "invalid_client", undefined, 401);
    }
    if (!client.redirect_uris.includes(redirectUri)) {
      return oauthError(reply, "invalid_request", "redirect_uri is not registered for this client");
    }

    try {
      const sessionId = await createMcpOAuthSession({
        clientId,
        redirectUri,
        codeChallenge,
        ...(client.client_name ? { clientName: client.client_name } : {}),
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

  app.post("/oauth/register", async (request, reply) => {
    const body = request.body as {
      redirect_uris?: string[];
      client_name?: string;
      token_endpoint_auth_method?: string;
      grant_types?: string[];
      response_types?: string[];
    };

    if (!body.redirect_uris?.length) {
      return oauthError(reply, "invalid_client_metadata", "redirect_uris required");
    }

    try {
      const client = await registerMcpOAuthClient({
        redirect_uris: body.redirect_uris,
        ...(body.client_name ? { client_name: body.client_name } : {}),
        ...(body.token_endpoint_auth_method
          ? { token_endpoint_auth_method: body.token_endpoint_auth_method }
          : {}),
        ...(body.grant_types ? { grant_types: body.grant_types } : {}),
        ...(body.response_types ? { response_types: body.response_types } : {}),
      });
      return reply.status(201).send(client);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed";
      if (
        message.includes("redirect_uri") ||
        message.includes("redirect_uris") ||
        message.includes("Invalid redirect")
      ) {
        return oauthError(reply, "invalid_client_metadata", message);
      }
      return oauthError(reply, "server_error", message, 503);
    }
  });

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
