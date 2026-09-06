import { isSafeResolvedOutboundUrl } from "./ssrf-resolve.js";

/**
 * Validate a customer-supplied webhook endpoint at registration time.
 *
 * This resolves DNS and rejects a hostname that points at a private or
 * loopback address, which the string-only `isSafeOutboundUrl` cannot see: it
 * inspects the hostname text, so `hooks.example.com A 127.0.0.1` passes it.
 * A webhook URL is stored once and then fetched by the server on every
 * publish, so it is exactly the input worth resolving before accepting.
 *
 * Delivery still runs the string guard on every redirect hop (`safeFetch`).
 * It cannot use this one: the Cloudflare publish worker shares that code and
 * `node:dns` is unavailable there even under nodejs_compat.
 */
export function isAllowedWebhookUrl(url: string): Promise<boolean> {
  return isSafeResolvedOutboundUrl(url, {
    httpsOnly: process.env.NODE_ENV === "production",
  });
}
