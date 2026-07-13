import { describe, it, expect } from "vitest";
import {
  isPrivateOrResolvedAddress,
  isSafeResolvedOutboundUrl,
} from "../lib/ssrf-resolve.js";

describe("isPrivateOrResolvedAddress", () => {
  it("allows public IPv4", () => {
    expect(isPrivateOrResolvedAddress("151.101.104.159")).toBe(false);
  });

  it("blocks private IPv4", () => {
    expect(isPrivateOrResolvedAddress("10.0.0.1")).toBe(true);
    expect(isPrivateOrResolvedAddress("127.0.0.1")).toBe(true);
    expect(isPrivateOrResolvedAddress("192.168.1.1")).toBe(true);
  });

  it("allows public IPv6 (CDN dual-stack)", () => {
    // Bare IPv6 must not be treated as private due to invalid URL parsing
    expect(isPrivateOrResolvedAddress("2a04:4e42:19::159")).toBe(false);
    expect(isPrivateOrResolvedAddress("2a03:2880:f311:c0:face:b00c:0:43fe")).toBe(
      false,
    );
  });

  it("blocks loopback / ULA IPv6", () => {
    expect(isPrivateOrResolvedAddress("::1")).toBe(true);
    expect(isPrivateOrResolvedAddress("fd12:3456:789a:1::1")).toBe(true);
    expect(isPrivateOrResolvedAddress("fe80::1")).toBe(true);
  });
});

describe("isSafeResolvedOutboundUrl", () => {
  it("allows pbs.twimg.com (dual-stack Twitter CDN)", async () => {
    const ok = await isSafeResolvedOutboundUrl(
      "https://pbs.twimg.com/profile_images/example_400x400.jpg",
      { httpsOnly: true },
    );
    expect(ok).toBe(true);
  });
});
