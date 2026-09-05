import type { FastifyReply, FastifyRequest } from "fastify";
import type { Ratelimit } from "@upstash/ratelimit";
import { apiError } from "../lib/api-errors.js";
import {
  enforceRateLimit,
  rpcLiveReadLimiter,
  rpcMutationLimiter,
  type RateLimitResult,
} from "../lib/ratelimit.js";
import { v1UserId } from "./api-auth.js";

/**
 * Per-user budgets for the live analytics / inbox routes on `/v1`.
 *
 * `requireV1ApiKey` already applies the hourly tier limit, but that is sized
 * for cheap CRUD. A live read fans out to platform APIs per request, and a
 * mutation verifies against a live read before it sends. The dashboard RPC
 * puts the same handlers behind `rpcLiveReadLimiter` (per-minute) and
 * `rpcMutationLimiter`; mirror that here so an API key cannot burn shared
 * platform quota the SPA is throttled from. Keys are namespaced `v1:` so a
 * CLI loop cannot starve the same user's dashboard.
 */

/** Seconds until the window resets; a sane floor when the limiter gave none. */
export function retryAfterSeconds(
  reset: number | undefined,
  now = Date.now(),
): number {
  if (!reset) return 60;
  const sec = Math.ceil((reset - now) / 1000);
  return Number.isFinite(sec) && sec > 0 ? sec : 60;
}

export function sendRateLimited(
  reply: FastifyReply,
  rate: Extract<RateLimitResult, { allowed: false }>,
): FastifyReply {
  if (rate.status === 429) {
    reply.header("Retry-After", String(retryAfterSeconds(rate.reset)));
  }
  return reply
    .status(rate.status)
    .send(apiError("rate_limit_exceeded", rate.error));
}

async function enforce(
  request: FastifyRequest,
  reply: FastifyReply,
  limiter: Ratelimit | null,
  bucket: "live" | "mutation",
): Promise<FastifyReply | undefined> {
  const rate = await enforceRateLimit(
    limiter,
    `v1:${bucket}:${v1UserId(request)}`,
  );
  if (rate.allowed) return undefined;
  return sendRateLimited(reply, rate);
}

/** Route-level preHandler for live platform reads (overview, comments, DMs). */
export async function requireV1LiveReadBudget(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  return enforce(request, reply, rpcLiveReadLimiter, "live");
}

/** Route-level preHandler for inbox mutations (reply, like, hide, DM send). */
export async function requireV1MutationBudget(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  return enforce(request, reply, rpcMutationLimiter, "mutation");
}
