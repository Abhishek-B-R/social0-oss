import type { FastifyRequest } from "fastify";
import { requestContext } from "./request-context.js";

/**
 * Fastify `trustProxy` value, from `TRUST_PROXY`.
 *
 * Never "trust everything": with `true`, Fastify (proxy-addr) and Better Auth
 * both take the *leftmost* X-Forwarded-For entry, which the client writes
 * itself. Cloudflare and nginx (`$proxy_add_x_forwarded_for`) append, so a
 * caller can send `X-Forwarded-For: <random>` per request and land in a fresh
 * rate-limit bucket every time.
 *
 * - unset: one hop in production (the reverse proxy in front of the API), off elsewhere
 * - `false` / `0`: ignore forwarding headers, use the socket address
 * - `true`: one hop (kept for existing deploys)
 * - a number: that many proxy hops (e.g. `2` for Cloudflare -> nginx -> API)
 * - anything else: proxy-addr list, e.g. `loopback,10.0.0.0/8`
 */
export function trustProxySetting(
  env: NodeJS.ProcessEnv = process.env,
): false | string | TrustHops {
  const raw = env.TRUST_PROXY?.trim();
  if (!raw) return env.NODE_ENV === "production" ? trustHops(1) : false;
  if (raw === "false" || raw === "0") return false;
  if (raw === "true") return trustHops(1);
  if (/^\d+$/.test(raw)) return trustHops(Number(raw));
  return raw;
}

/** proxy-addr's trust callback: `hop` 0 is the socket peer, 1 the next, and so on. */
export type TrustHops = ((address: string, hop: number) => boolean) & { hops: number };

/**
 * Trust the nearest `n` proxies. Fastify 5.12 treats a bare number as "trust
 * nothing" (so the API would see every user as the proxy's address and share
 * one rate-limit bucket); this is the hop-count rule proxy-addr itself used.
 */
function trustHops(n: number): TrustHops {
  return Object.assign((_address: string, hop: number) => hop < n, { hops: n });
}

/**
 * Rewrites the inbound forwarding headers to the single address Fastify
 * resolved under `trustProxySetting()`, so every later reader (Better Auth's
 * limiter and session IP, `clientIp()`, handlers copying headers into a Web
 * `Request`) sees a value the client cannot choose. Runs as a root onRequest
 * hook. Idempotent: re-resolving a one-entry header yields the same address.
 */
export function normalizeForwardedFor(request: FastifyRequest): void {
  const ip = request.ip;
  const headers = request.raw.headers;
  delete headers["x-real-ip"];
  if (ip) headers["x-forwarded-for"] = ip;
  else delete headers["x-forwarded-for"];
}

/**
 * Client IP for rate limiting. Uses the address Fastify resolved for the
 * current request (see `trustProxySetting()`); request headers are never read
 * here, so a forged X-Forwarded-For cannot pick the bucket.
 */
export function clientIp(
  _request: Request,
  options?: { socketIp?: string },
): string {
  const resolved = requestContext.getStore()?.req.ip?.trim();
  if (resolved) return resolved;

  const socketIp = options?.socketIp?.trim();
  if (socketIp) return socketIp;

  return "anonymous";
}
