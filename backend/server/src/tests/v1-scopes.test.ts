/**
 * OAuth scopes are enforced on `/v1`, from one table that has to match both
 * the OpenAPI spec and the routes Fastify actually registers. Before, every
 * token got every scope and nothing checked them.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { MCP_OAUTH_SCOPES } from "../lib/mcp-oauth.js";
import { hasV1Scope, scopesForV1Route, V1_ROUTE_SCOPES } from "../lib/v1-scopes.js";
import { registerV1Routes } from "../routes/v1/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(resolve(here, "../../openapi/openapi.json"), "utf8")) as {
  paths: Record<string, Record<string, { security?: Array<Record<string, string[]>> }>>;
};

function specScopes(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
      const oauth = op.security?.find((s) => "oauth2" in s)?.oauth2;
      if (!oauth) continue;
      out[`${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ":$1")}`] = oauth;
    }
  }
  return out;
}

describe("V1_ROUTE_SCOPES", () => {
  it("matches the OpenAPI spec operation for operation", () => {
    expect(V1_ROUTE_SCOPES).toEqual(specScopes());
  });

  it("covers every route /v1 registers", async () => {
    const app = Fastify();
    const routes: string[] = [];
    app.addHook("onRoute", (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const m of methods) if (m !== "HEAD") routes.push(`${m} ${route.url}`);
    });
    await app.register(registerV1Routes, { prefix: "/v1" });
    await app.ready();
    await app.close();

    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter((r) => !(r in V1_ROUTE_SCOPES))).toEqual([]);
  });

  it("only names scopes the authorization server can grant", () => {
    const granted = new Set<string>(MCP_OAUTH_SCOPES);
    for (const scopes of Object.values(V1_ROUTE_SCOPES)) {
      for (const scope of scopes) expect(granted.has(scope)).toBe(true);
    }
  });

  it("accepts a fine-grained or an umbrella scope", () => {
    const accepted = scopesForV1Route("POST", "/v1/posts")!;
    expect(hasV1Scope(["posts:write"], accepted)).toBe(true);
    expect(hasV1Scope(["social0:write"], accepted)).toBe(true);
    expect(hasV1Scope(["posts:read", "social0:read"], accepted)).toBe(false);
    expect(scopesForV1Route("GET", "/v1/not-a-route")).toBeNull();
  });
});

describe("mcp-worker scope list", () => {
  it("advertises the same scopes as the API", () => {
    const worker = readFileSync(
      resolve(here, "../../../../cloudflare/mcp-worker/src/auth.ts"),
      "utf8",
    );
    const block = worker.match(/const MCP_OAUTH_SCOPES = \[([\s\S]*?)\]/)?.[1] ?? "";
    const listed = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(listed).toEqual([...MCP_OAUTH_SCOPES]);
  });
});
