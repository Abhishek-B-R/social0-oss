import { isSafeOutboundUrl } from "@social0/shared";

/**
 * Check whether a DNS-resolved address is private/local.
 * IPv6 literals must be bracketed for URL parsing (`http://[::1]/`).
 */
export function isPrivateOrResolvedAddress(address: string): boolean {
  const host = address.includes(":") ? `[${address}]` : address;
  return !isSafeOutboundUrl(`http://${host}/`);
}

/** ponytail: DNS resolve at fetch time — blocks rebinding to loopback/metadata after URL validation. */
export async function isSafeResolvedOutboundUrl(
  urlString: string,
  options: { httpsOnly?: boolean } = {},
): Promise<boolean> {
  if (!isSafeOutboundUrl(urlString, options)) return false;

  let hostname: string;
  try {
    hostname = new URL(urlString).hostname;
  } catch {
    return false;
  }

  try {
    const { lookup } = await import("node:dns/promises");
    const results = await lookup(hostname, { all: true });
    if (results.length === 0) return false;
    return results.every((r) => !isPrivateOrResolvedAddress(r.address));
  } catch {
    return false;
  }
}
