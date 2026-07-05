import { lookup } from "node:dns/promises";
import { isSafeOutboundUrl } from "@social0/shared";

function isPrivateOrResolvedAddress(address: string): boolean {
  return !isSafeOutboundUrl(`http://${address}/`);
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
    const results = await lookup(hostname, { all: true });
    if (results.length === 0) return false;
    return results.every((r) => !isPrivateOrResolvedAddress(r.address));
  } catch {
    return false;
  }
}
