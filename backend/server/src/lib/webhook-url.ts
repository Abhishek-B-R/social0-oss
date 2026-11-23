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
 * Delivery re-checks on every attempt and redirect hop. On the API droplet
 * the socket's DNS lookup rejects non-public addresses at connect time
 * (`public-address-fetch.ts`), which also closes the DNS-rebinding window
 * between this check and a later delivery. The Cloudflare publish worker has
 * no `node:dns`, so it runs only the string guard per hop; the edge cannot
 * reach the droplet's private network.
 */
export function isAllowedWebhookUrl(url: string): Promise<boolean> {
  return isSafeResolvedOutboundUrl(url, {
    httpsOnly: process.env.NODE_ENV === "production",
  });
}
