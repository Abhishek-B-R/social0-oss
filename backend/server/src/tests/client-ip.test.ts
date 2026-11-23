import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  clientIp,
  normalizeForwardedFor,
  trustProxySetting,
} from "../lib/client-ip.js";
import { runWithRequestContext } from "../lib/request-context.js";

/** A hop-count setting's number, or the setting itself (false / proxy list). */
function hopsOf(v: ReturnType<typeof trustProxySetting>) {
  return typeof v === "function" ? v.hops : v;
}

describe("trustProxySetting", () => {
  it("defaults to one hop in production and off elsewhere", () => {
    expect(hopsOf(trustProxySetting({ NODE_ENV: "production" }))).toBe(1);
    expect(hopsOf(trustProxySetting({ NODE_ENV: "development" }))).toBe(false);
    expect(hopsOf(trustProxySetting({}))).toBe(false);
  });

  it("never trusts every hop, even for TRUST_PROXY=true", () => {
    expect(hopsOf(trustProxySetting({ TRUST_PROXY: "true" }))).toBe(1);
    expect(hopsOf(trustProxySetting({ TRUST_PROXY: "false", NODE_ENV: "production" }))).toBe(false);
    expect(hopsOf(trustProxySetting({ TRUST_PROXY: "0" }))).toBe(false);
    expect(hopsOf(trustProxySetting({ TRUST_PROXY: "2" }))).toBe(2);
    expect(hopsOf(trustProxySetting({ TRUST_PROXY: " loopback,10.0.0.0/8 " }))).toBe(
      "loopback,10.0.0.0/8",
    );
  });
});

async function buildProbe(setting: false | number | string) {
  // Same path the app takes: numbers become a hop-count trust function.
  const trustProxy =
    setting === false ? false : trustProxySetting({ TRUST_PROXY: String(setting) });
  const app = Fastify({ trustProxy });
  app.addHook("onRequest", async (request) => {
    normalizeForwardedFor(request);
  });
  app.get("/probe", async (request, reply) =>
    runWithRequestContext({ req: request, reply }, async () => ({
      xff: request.headers["x-forwarded-for"] ?? null,
      xRealIp: request.headers["x-real-ip"] ?? null,
      clientIp: clientIp(new Request("http://localhost/probe")),
    })),
  );
  await app.ready();
  return app;
}

describe("normalizeForwardedFor + clientIp", () => {
  it("ignores a client-written leftmost X-Forwarded-For behind one proxy", async () => {
    const app = await buildProbe(1);
    // Client sent "6.6.6.6"; the proxy (127.0.0.1) appended the real peer.
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      remoteAddress: "127.0.0.1",
      headers: {
        "x-forwarded-for": "6.6.6.6, 203.0.113.7",
        "x-real-ip": "6.6.6.6",
      },
    });
    expect(res.json()).toEqual({
      xff: "203.0.113.7",
      xRealIp: null,
      clientIp: "203.0.113.7",
    });
    await app.close();
  });

  it("rotating the spoofed entry does not change the bucket", async () => {
    const app = await buildProbe(1);
    const seen = new Set<string>();
    for (const spoof of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      const res = await app.inject({
        method: "GET",
        url: "/probe",
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": `${spoof}, 198.51.100.4` },
      });
      seen.add(res.json().clientIp);
    }
    expect([...seen]).toEqual(["198.51.100.4"]);
    await app.close();
  });

  it("with two hops (Cloudflare -> nginx) keys on the address Cloudflare saw", async () => {
    const app = await buildProbe(2);
    // Client forged "6.6.6.6"; Cloudflare appended the real peer, nginx appended the edge.
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7, 172.70.1.1" },
    });
    expect(res.json().clientIp).toBe("203.0.113.7");
    expect(res.json().xff).toBe("203.0.113.7");
    await app.close();
  });

  it("uses the socket address when proxies are not trusted", async () => {
    const app = await buildProbe(false);
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      remoteAddress: "192.0.2.9",
      headers: { "x-forwarded-for": "6.6.6.6" },
    });
    expect(res.json()).toEqual({
      xff: "192.0.2.9",
      xRealIp: null,
      clientIp: "192.0.2.9",
    });
    await app.close();
  });

  it("does not read headers outside a request context", () => {
    const forged = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "6.6.6.6", "x-real-ip": "6.6.6.6" },
    });
    expect(clientIp(forged)).toBe("anonymous");
    expect(clientIp(forged, { socketIp: "192.0.2.1" })).toBe("192.0.2.1");
  });
});
