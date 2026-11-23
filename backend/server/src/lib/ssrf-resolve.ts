import { isSafeOutboundUrl } from "@social0/shared";

/**
 * `code` on the connect-time lookup error raised by `public-address-fetch.ts`
 * when a host resolves to a non-public address. Lives here, not there, so
 * edge-safe callers can recognise the error without importing `node:http`.
 */
export const NON_PUBLIC_ADDRESS_CODE = "ENONPUBLICADDRESS";

/**
 * Hard ceiling on one `isSafeResolvedOutboundUrl` DNS check. The hostname is
 * user-supplied (webhook URLs), so its authoritative server may never answer.
 */
export const SAFE_RESOLVE_TIMEOUT_MS = 2_000;

/** Resolver answers that mean "no records of this family", not "lookup failed". */
const NO_RECORDS_CODES = new Set(["ENODATA", "ENOTFOUND"]);

/**
 * Check whether a DNS-resolved address is private/local.
 * IPv6 literals must be bracketed for URL parsing (`http://[::1]/`).
 */
export function isPrivateOrResolvedAddress(address: string): boolean {
  const host = address.includes(":") ? `[${address}]` : address;
  return !isSafeOutboundUrl(`http://${host}/`);
}

/**
 * Resolve A + AAAA for `hostname`, or null when the lookup failed or timed out.
 *
 * Uses `dns.promises.Resolver` (c-ares, async sockets) rather than
 * `dns.lookup`: `lookup` is getaddrinfo on libuv's 4-thread pool with no
 * timeout, shared with every pg connect and outbound fetch in the process, so
 * a hostname whose nameserver drops queries would park a pool thread per
 * request and stall unrelated work. A fresh resolver per call lets the
 * deadline `cancel()` only this check's queries.
 */
async function resolvePublicCandidates(
  hostname: string,
): Promise<string[] | null> {
  const { Resolver } = await import("node:dns/promises");
  const resolver = new Resolver({ timeout: SAFE_RESOLVE_TIMEOUT_MS, tries: 1 });
  // `timeout` is per query per nameserver; with several nameservers c-ares
  // walks them in turn. Cap the whole check, not just one attempt.
  const deadline = setTimeout(() => resolver.cancel(), SAFE_RESOLVE_TIMEOUT_MS);
  deadline.unref?.();
  try {
    const settled = await Promise.allSettled([
      resolver.resolve4(hostname),
      resolver.resolve6(hostname),
    ]);
    const addresses: string[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        addresses.push(...result.value);
        continue;
      }
      const code = (result.reason as NodeJS.ErrnoException | undefined)?.code;
      // A timeout or SERVFAIL on one family leaves that family unchecked.
      if (!code || !NO_RECORDS_CODES.has(code)) return null;
    }
    return addresses;
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

/** ponytail: DNS resolve at fetch time — blocks rebinding to loopback/metadata after URL validation. */
export async function isSafeResolvedOutboundUrl(
  urlString: string,
  options: { httpsOnly?: boolean } = {},
): Promise<boolean> {
  if (!isSafeOutboundUrl(urlString, options)) return false;

  let hostname: string;
  try {
    hostname = new URL(urlString).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }

  // An address literal needs no lookup (and the resolver would reject it).
  // `node:*` stays a dynamic import: the publish worker loads this module.
  const { isIP } = await import("node:net");
  if (isIP(hostname)) return !isPrivateOrResolvedAddress(hostname);

  const addresses = await resolvePublicCandidates(hostname);
  if (!addresses || addresses.length === 0) return false;
  return addresses.every((address) => !isPrivateOrResolvedAddress(address));
}
