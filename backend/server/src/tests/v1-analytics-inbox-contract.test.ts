/**
 * The CLI and MCP are built against the published spec, so a route added
 * without a spec entry (or a scope added without a catalog entry) ships a
 * silently undocumented API. Keep the two in step.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { API_OAUTH_SCOPES } from "../lib/api-scopes.js";
import { MCP_OAUTH_SCOPES } from "../lib/mcp-oauth.js";

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(
  readFileSync(resolve(here, "../../openapi/openapi.json"), "utf8"),
) as {
  paths: Record<string, Record<string, { operationId?: string; tags?: string[] }>>;
  tags: Array<{ name: string }>;
};

const ROUTES: Array<[string, string, string]> = [
  ["get", "/v1/analytics/accounts", "listAnalyticsAccounts"],
  ["get", "/v1/analytics/overview", "getAnalyticsOverview"],
  ["get", "/v1/analytics/posts/{postId}", "getPostAnalytics"],
  ["get", "/v1/inbox/accounts", "listInboxAccounts"],
  ["get", "/v1/inbox/comments", "listInboxComments"],
  ["post", "/v1/inbox/comments/{commentId}/reply", "replyToInboxComment"],
  ["post", "/v1/inbox/comments/{commentId}/like", "likeInboxComment"],
  ["post", "/v1/inbox/comments/{commentId}/hide", "hideInboxComment"],
  ["get", "/v1/inbox/dms", "listInboxDms"],
  ["get", "/v1/inbox/dms/{conversationId}", "getInboxDmThread"],
  ["post", "/v1/inbox/dms/{conversationId}/reply", "replyToInboxDm"],
];

describe("v1 analytics + inbox spec", () => {
  it.each(ROUTES)("documents %s %s", (method, path, operationId) => {
    const op = spec.paths[path]?.[method];
    expect(op, `${method.toUpperCase()} ${path} missing from openapi.json`).toBeTruthy();
    expect(op!.operationId).toBe(operationId);
  });

  it("tags the new operations so /docs groups them", () => {
    const tagNames = spec.tags.map((t) => t.name);
    expect(tagNames).toContain("Analytics");
    expect(tagNames).toContain("Inbox");
    for (const [method, path] of ROUTES) {
      const tags = spec.paths[path]![method]!.tags ?? [];
      expect(tags.some((t) => t === "Analytics" || t === "Inbox")).toBe(true);
    }
  });

  it("keeps every documented scope in the catalog", () => {
    const catalog = Object.keys(API_OAUTH_SCOPES);
    for (const scope of ["analytics:read", "inbox:read", "inbox:write"]) {
      expect(catalog).toContain(scope);
      expect(MCP_OAUTH_SCOPES as readonly string[]).toContain(scope);
    }
  });

  it("only references scopes the catalog knows about", () => {
    const catalog = new Set(Object.keys(API_OAUTH_SCOPES));
    for (const [method, path] of ROUTES) {
      const op = spec.paths[path]![method] as unknown as {
        security?: Array<Record<string, string[]>>;
      };
      for (const entry of op.security ?? []) {
        for (const scope of entry.oauth2 ?? []) {
          expect(catalog.has(scope), `${scope} on ${method} ${path}`).toBe(true);
        }
      }
    }
  });
});
