const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => Number.parseInt(p, 10));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return octets;
}

function isPrivateIpv4(host: string): boolean {
  const o = parseIpv4(host);
  if (!o) return false;
  const [a, b] = o;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true; // multicast + reserved/broadcast
  return false;
}

/**
 * Expand an IPv6 text form to its 8 groups. Returns null when the literal is
 * not parseable, so callers can fall back to treating it as a name.
 *
 * The WHATWG URL parser hands us the *compressed hex* serialization, so
 * `[::ffff:127.0.0.1]` arrives as `::ffff:7f00:1`. A `startsWith`-based check
 * on the text can never see the IPv4 inside it — this is why the groups have
 * to be parsed rather than string-matched.
 */
function parseIpv6Groups(host: string): number[] | null {
  let text = host;

  // A trailing dotted-quad (`::ffff:127.0.0.1`) is two more groups.
  const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted) {
    const octets = parseIpv4(dotted[2]!);
    if (!octets) return null;
    const hi = ((octets[0]! << 8) | octets[1]!).toString(16);
    const lo = ((octets[2]! << 8) | octets[3]!).toString(16);
    text = `${dotted[1]}${hi}:${lo}`;
  }

  const [head, tail, ...extra] = text.split("::");
  if (extra.length > 0) return null;

  const toGroups = (segment: string | undefined): number[] | null => {
    if (!segment) return [];
    const out: number[] = [];
    for (const part of segment.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
      out.push(Number.parseInt(part, 16));
    }
    return out;
  };

  const headGroups = toGroups(head);
  if (!headGroups) return null;

  if (tail === undefined) {
    return headGroups.length === 8 ? headGroups : null;
  }

  const tailGroups = toGroups(tail);
  if (!tailGroups) return null;

  const fill = 8 - headGroups.length - tailGroups.length;
  if (fill < 0) return null;
  return [...headGroups, ...new Array<number>(fill).fill(0), ...tailGroups];
}

function isPrivateIpv6(host: string): boolean {
  const g = parseIpv6Groups(host.toLowerCase());
  if (!g) return false;

  const isZeroPrefix = (count: number) => g.slice(0, count).every((x) => x === 0);

  // ::  (unspecified — routes to localhost on most stacks) and ::1 (loopback)
  if (isZeroPrefix(7) && (g[7] === 0 || g[7] === 1)) return true;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) — judge the v4 address.
  if (isZeroPrefix(5) && (g[5] === 0xffff || g[5] === 0)) {
    return isPrivateIpv4(ipv4FromGroups(g));
  }
  // IPv4-translated ::ffff:0:a.b.c.d
  if (isZeroPrefix(4) && g[4] === 0xffff && g[5] === 0) {
    return isPrivateIpv4(ipv4FromGroups(g));
  }
  // NAT64 well-known prefix 64:ff9b::/96 and 64:ff9b:1::/48
  if (g[0] === 0x64 && g[1] === 0xff9b) return true;

  // fc00::/7 unique local, fe80::/10 link local, ff00::/8 multicast
  if ((g[0]! & 0xfe00) === 0xfc00) return true;
  if ((g[0]! & 0xffc0) === 0xfe80) return true;
  if ((g[0]! & 0xff00) === 0xff00) return true;

  return false;
}

function ipv4FromGroups(g: number[]): string {
  const hi = g[6] ?? 0;
  const lo = g[7] ?? 0;
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function normalizeHostname(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Octal / hex dotted forms — the WHATWG parser already canonicalises these,
  // so anything still in that shape is a name, not an address. Leave it be.
  if (host.split(".").some((p) => /^0[0-9]/.test(p) || /^0x/i.test(p))) {
    return hostname.toLowerCase();
  }

  return host;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.includes(":")) return isPrivateIpv6(host);
  return isPrivateIpv4(host);
}

export type SafeOutboundUrlOptions = {
  /** When true, only https: URLs are allowed (recommended for webhooks in production). */
  httpsOnly?: boolean;
};

/**
 * Returns true when a URL is safe for server-side fetch (blocks loopback, RFC1918, link-local, metadata).
 */
export function isSafeOutboundUrl(
  urlString: string,
  options: SafeOutboundUrlOptions = {},
): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (options.httpsOnly && u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (!u.hostname) return false;
    if (isPrivateOrLocalHost(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
