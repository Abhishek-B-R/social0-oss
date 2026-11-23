/**
 * `isSafeResolvedOutboundUrl` resolves user-supplied hostnames (webhook URLs).
 *
 * The regression this pins: it used `dns/promises.lookup`, which is
 * getaddrinfo on libuv's 4-thread pool with no timeout. That pool also serves
 * every pg connect and outbound fetch, so a webhook URL on a nameserver that
 * drops queries parked one pool thread per request for the resolver's whole
 * retry budget and stalled unrelated work. The check must go through the
 * c-ares `Resolver` (off the threadpool) and give up on its own deadline.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Answer = string[] | NodeJS.ErrnoException | "hang";

const { dns } = vi.hoisted(() => ({
  dns: {
    /** hostname -> [A answer, AAAA answer]. Missing = ENOTFOUND for both. */
    table: new Map<string, [Answer, Answer]>(),
    resolverOptions: [] as unknown[],
    cancelled: 0,
    lookup: vi.fn(),
  },
}));

function dnsError(code: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(`query ${code}`);
  err.code = code;
  return err;
}

vi.mock("node:dns/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:dns/promises")>();

  class FakeResolver {
    private pending = new Set<(err: Error) => void>();

    constructor(options?: unknown) {
      dns.resolverOptions.push(options);
    }

    cancel() {
      dns.cancelled++;
      for (const reject of this.pending) reject(dnsError("ECANCELLED"));
      this.pending.clear();
    }

    private answer(hostname: string, family: 0 | 1): Promise<string[]> {
      const answer = dns.table.get(hostname)?.[family] ?? dnsError("ENOTFOUND");
      if (answer === "hang") {
        return new Promise((_resolve, reject) => {
          this.pending.add(reject);
        });
      }
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(answer);
    }

    resolve4(hostname: string) {
      return this.answer(hostname, 0);
    }

    resolve6(hostname: string) {
      return this.answer(hostname, 1);
    }
  }

  return {
    ...actual,
    default: { ...actual, Resolver: FakeResolver, lookup: dns.lookup },
    Resolver: FakeResolver,
    lookup: dns.lookup,
  };
});

import {
  SAFE_RESOLVE_TIMEOUT_MS,
  isSafeResolvedOutboundUrl,
} from "../lib/ssrf-resolve.js";

const PUBLIC_V4 = "93.184.216.34";
const PUBLIC_V6 = "2606:2800:220:1:248:1893:25c8:1946";

beforeEach(() => {
  dns.table.clear();
  dns.resolverOptions.length = 0;
  dns.cancelled = 0;
  dns.lookup.mockReset();
  dns.lookup.mockRejectedValue(new Error("dns.lookup must not be used"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isSafeResolvedOutboundUrl resolver", () => {
  it("resolves through a bounded c-ares Resolver, never getaddrinfo", async () => {
    dns.table.set("hooks.example.com", [[PUBLIC_V4], [PUBLIC_V6]]);

    await expect(
      isSafeResolvedOutboundUrl("https://hooks.example.com/in"),
    ).resolves.toBe(true);

    expect(dns.lookup).not.toHaveBeenCalled();
    expect(dns.resolverOptions).toEqual([
      { timeout: SAFE_RESOLVE_TIMEOUT_MS, tries: 1 },
    ]);
    expect(SAFE_RESOLVE_TIMEOUT_MS).toBeLessThanOrEqual(2_000);
  });

  it("gives up at the deadline when the nameserver never answers", async () => {
    vi.useFakeTimers();
    dns.table.set("x.blackhole.example", ["hang", "hang"]);

    let settled: boolean | undefined;
    const pending = isSafeResolvedOutboundUrl(
      "https://x.blackhole.example/",
    ).then((ok) => {
      settled = ok;
    });

    await vi.advanceTimersByTimeAsync(SAFE_RESOLVE_TIMEOUT_MS - 1);
    expect(settled).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(false);
    expect(dns.cancelled).toBe(1);
  });

  it("accepts a host with only A records (AAAA answers ENODATA)", async () => {
    dns.table.set("v4only.example", [[PUBLIC_V4], dnsError("ENODATA")]);
    await expect(
      isSafeResolvedOutboundUrl("https://v4only.example/"),
    ).resolves.toBe(true);
  });

  it("refuses when any family has a non-public record", async () => {
    dns.table.set("mixed.example", [[PUBLIC_V4], ["::1"]]);
    await expect(
      isSafeResolvedOutboundUrl("https://mixed.example/"),
    ).resolves.toBe(false);

    dns.table.set("rebound.example", [[PUBLIC_V4, "10.0.0.5"], []]);
    await expect(
      isSafeResolvedOutboundUrl("https://rebound.example/"),
    ).resolves.toBe(false);
  });

  it("refuses when one family fails for a reason other than no records", async () => {
    // The unanswered family could hold a private address; fail closed.
    dns.table.set("flaky.example", [[PUBLIC_V4], dnsError("ETIMEOUT")]);
    await expect(
      isSafeResolvedOutboundUrl("https://flaky.example/"),
    ).resolves.toBe(false);
  });

  it("refuses a name that does not exist", async () => {
    await expect(
      isSafeResolvedOutboundUrl("https://missing.example/"),
    ).resolves.toBe(false);
  });

  it("checks address literals without a DNS query", async () => {
    await expect(
      isSafeResolvedOutboundUrl(`https://${PUBLIC_V4}/hook`),
    ).resolves.toBe(true);
    await expect(
      isSafeResolvedOutboundUrl(`https://[${PUBLIC_V6}]/hook`),
    ).resolves.toBe(true);
    await expect(isSafeResolvedOutboundUrl("https://[::1]/hook")).resolves.toBe(
      false,
    );
    expect(dns.resolverOptions).toEqual([]);
    expect(dns.lookup).not.toHaveBeenCalled();
  });
});
