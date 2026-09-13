import { describe, it, expect } from "vitest";
import { isSafeOutboundUrl } from "@social0/shared";

/**
 * The WHATWG URL parser hands back the *compressed hex* IPv6 serialization, so
 * `[::ffff:127.0.0.1]` arrives as `[::ffff:7f00:1]`. Text matching on the host
 * cannot see the IPv4 inside it — these cases are the regression guard.
 */
describe("isSafeOutboundUrl — IPv6 literals", () => {
  it("blocks IPv4-mapped loopback and RFC1918 in every spelling", () => {
    for (const url of [
      "http://[::ffff:127.0.0.1]/",
      "http://[0:0:0:0:0:ffff:7f00:1]/",
      "http://[::ffff:7f00:1]/",
      "http://[::ffff:10.0.0.1]/",
      "http://[::ffff:169.254.169.254]/",
      "http://[::ffff:0:127.0.0.1]/",
      "http://[::127.0.0.1]/",
    ]) {
      expect(isSafeOutboundUrl(url), url).toBe(false);
    }
  });

  it("blocks unspecified, loopback, ULA, link-local, multicast and NAT64", () => {
    for (const url of [
      "http://[::]/",
      "http://[::1]/",
      "http://[fc00::1]/",
      "http://[fd12:3456::1]/",
      "http://[fe80::1]/",
      "http://[fec0::1]/",
      "http://[ff02::1]/",
      "http://[64:ff9b::7f00:1]/",
    ]) {
      expect(isSafeOutboundUrl(url), url).toBe(false);
    }
  });

  it("still allows public IPv6", () => {
    expect(isSafeOutboundUrl("https://[2606:4700:4700::1111]/")).toBe(true);
    expect(isSafeOutboundUrl("https://[2a04:4e42:19::159]/")).toBe(true);
  });
});

describe("isSafeOutboundUrl — IPv4 and hosts", () => {
  it("blocks loopback, private, link-local, CGNAT and alternate encodings", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://127.1/",
      "http://0.0.0.0/",
      "http://10.1.2.3/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/",
      "http://100.64.0.1/",
      "http://192.0.0.1/",
      "http://198.18.0.1/",
      "http://224.0.0.1/",
      "http://255.255.255.255/",
      "http://0x7f000001/",
      "http://2130706433/",
      "http://0177.0.0.1/",
    ]) {
      expect(isSafeOutboundUrl(url), url).toBe(false);
    }
  });

  it("blocks internal names, credentials and non-http schemes", () => {
    expect(isSafeOutboundUrl("http://localhost/")).toBe(false);
    expect(isSafeOutboundUrl("http://metadata.google.internal/")).toBe(false);
    expect(isSafeOutboundUrl("http://printer.local/")).toBe(false);
    expect(isSafeOutboundUrl("http://user:pw@example.com/")).toBe(false);
    expect(isSafeOutboundUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeOutboundUrl("ftp://example.com/")).toBe(false);
  });

  it("allows public addresses and hostnames", () => {
    for (const url of [
      "https://example.com/",
      "http://93.184.216.34/",
      "https://172.32.0.1/",
      "https://11.0.0.1/",
      "https://192.169.1.1/",
      "https://192.0.1.1/",
      "https://100.128.0.1/",
      "https://api.internal.example.com/",
    ]) {
      expect(isSafeOutboundUrl(url), url).toBe(true);
    }
  });

  it("honours httpsOnly", () => {
    expect(isSafeOutboundUrl("http://example.com/", { httpsOnly: true })).toBe(
      false,
    );
    expect(isSafeOutboundUrl("https://example.com/", { httpsOnly: true })).toBe(
      true,
    );
  });
});
