import type { FastifyReply, FastifyRequest } from "fastify";
import { isApiKeyFormat, resolveRawApiKey, type ApiKeyAuth } from "../lib/api-keys.js";
import {
  MCP_PROXY_TOKEN_SIGNATURE_HEADER,
  mcpResourceUrl,
  resolveMcpAccessTokenAuth,
  verifyMcpProxyToken,
} from "../lib/mcp-oauth.js";
import { apiError, V1_WWW_AUTHENTICATE } from "../lib/api-errors.js";
import { getSubscriptionForUser } from "../lib/subscription.js";
import { hasV1Scope, scopesForV1Route } from "../lib/v1-scopes.js";
import { resolveV1Workspace } from "../lib/v1-workspace.js";
import { TtlCache } from "../lib/ttl-cache.js";
import type { SubscriptionState } from "../lib/subscription.js";
import {
  applyRateLimitHeaders,
  enforceApiRateLimit,
  FREE_TIER_RATE_LIMIT,
  type ApiRateLimitInfo,
} from "../lib/api-rate-limits.js";

export type V1Caller = ApiKeyAuth & {
  /**
   * OAuth scopes granted to the token, or null for an API key (keys have full
   * account access, as the OpenAPI spec says).
   */
  scopes: string[] | null;
};

export type V1AuthContext = V1Caller & {
  subscription: SubscriptionState;
};

/**
 * Who is calling `/v1`: an API key (`sk_live_…`), or an MCP OAuth access token
 * forwarded by the mcp-worker. The token acts through the user's connector
 * key, and is accepted only with the worker's signature for that exact token
 * (`verifyMcpProxyToken`): OAuth tokens are issued for the MCP resource, so a
 * host holding one cannot call the API directly with it.
 */
export async function resolveV1Caller(
  headers: Record<string, string | string[] | undefined>,
): Promise<V1Caller | null> {
  const authorization = headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  if (isApiKeyFormat(token)) {
    const auth = await resolveRawApiKey(token);
    return auth ? { ...auth, scopes: null } : null;
  }

  const signature = headers[MCP_PROXY_TOKEN_SIGNATURE_HEADER];
  if (
    typeof signature !== "string" ||
    !verifyMcpProxyToken(token, signature, process.env.MCP_OAUTH_INTROSPECT_SECRET)
  ) {
    return null;
  }
  const oauth = await resolveMcpAccessTokenAuth(token);
  // Only tokens issued for the MCP resource, which this worker serves.
  if (!oauth || oauth.resource !== mcpResourceUrl()) return null;
  return {
    userId: oauth.userId,
    apiKeyId: oauth.apiKeyId,
    scopes: oauth.scope.split(/\s+/).filter(Boolean),
  };
}

declare module "fastify" {
  interface FastifyRequest {
    v1Auth?: V1AuthContext;
    v1RateLimit?: ApiRateLimitInfo;
  }
}

export async function requireV1ApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<V1AuthContext | null> {
  const auth = await resolveV1Caller(request.headers);

  if (!auth) {
    applyRateLimitHeaders(reply, FREE_TIER_RATE_LIMIT);
    reply.header("WWW-Authenticate", V1_WWW_AUTHENTICATE);
    reply
      .status(401)
      .send(apiError("invalid_api_key", "API key is invalid."));
    return null;
  }

  // An OAuth token may only call routes its granted scopes cover. API keys
  // (scopes null) have full access. A route missing from the table is refused.
  if (auth.scopes) {
    const accepted = scopesForV1Route(request.method, request.routeOptions.url);
    if (!accepted || !hasV1Scope(auth.scopes, accepted)) {
      const needed = accepted?.join(" ") ?? "";
      reply.header(
        "WWW-Authenticate",
        `${V1_WWW_AUTHENTICATE}, error="insufficient_scope", scope="${needed}"`,
      );
      reply
        .status(403)
        .send(
          apiError(
            "forbidden",
            accepted
              ? `This connection was not granted access to this action. It needs one of: ${accepted.join(", ")}.`
              : "This connection cannot use this endpoint.",
            { required_scopes: accepted ?? [] },
          ),
        );
      return null;
    }
  }

  const subscription = await subscriptionFor(auth.userId);
  const rate = await enforceApiRateLimit(subscription.tier, auth.userId);
  applyRateLimitHeaders(reply, rate.info);
  request.v1RateLimit = rate.info;
  if (!rate.allowed) {
    if (rate.retryAfterSec) {
      reply.header("Retry-After", String(rate.retryAfterSec));
    }
    reply
      .status(rate.status)
      .send(apiError("rate_limit_exceeded", rate.error));
    return null;
  }

  const ctx: V1AuthContext = { ...auth, subscription };
  request.v1Auth = ctx;

  request.log = request.log.child({
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
  });

  if (!(await resolveV1Workspace(request, reply, auth.userId))) return null;

  return ctx;
}

/**
 * The plan tier only sets the hourly /v1 budget, and reading it was a Postgres
 * query on every request. A plan change shows up here within this long.
 */
export const V1_SUBSCRIPTION_CACHE_TTL_MS = 30_000;
const subscriptionCache = new TtlCache<string, SubscriptionState>(
  V1_SUBSCRIPTION_CACHE_TTL_MS,
  10_000,
);

async function subscriptionFor(userId: string): Promise<SubscriptionState> {
  const cached = subscriptionCache.get(userId);
  if (cached) return cached;
  const subscription = await getSubscriptionForUser(userId);
  subscriptionCache.set(userId, subscription);
  return subscription;
}

export function v1UserId(request: FastifyRequest): string {
  return request.v1Auth!.userId;
}
