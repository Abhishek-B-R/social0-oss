import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveApiKeyAuth, type ApiKeyAuth } from "../lib/api-keys.js";
import { apiError, V1_WWW_AUTHENTICATE } from "../lib/api-errors.js";
import { getSubscriptionForUser } from "../lib/subscription.js";
import type { SubscriptionState } from "../lib/subscription.js";
import {
  applyRateLimitHeaders,
  enforceApiRateLimit,
  FREE_TIER_RATE_LIMIT,
  type ApiRateLimitInfo,
} from "../lib/api-rate-limits.js";

export type V1AuthContext = ApiKeyAuth & {
  subscription: SubscriptionState;
};

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
  const auth = await resolveApiKeyAuth(
    request.headers.authorization as string | undefined,
  );

  if (!auth) {
    applyRateLimitHeaders(reply, FREE_TIER_RATE_LIMIT);
    reply.header("WWW-Authenticate", V1_WWW_AUTHENTICATE);
    reply
      .status(401)
      .send(apiError("invalid_api_key", "API key is invalid."));
    return null;
  }

  const subscription = await getSubscriptionForUser(auth.userId);
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

  return ctx;
}

export function v1UserId(request: FastifyRequest): string {
  return request.v1Auth!.userId;
}
