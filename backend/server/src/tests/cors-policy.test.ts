import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import {
  allowsMissingCorsOrigin,
  isMcpOAuthCorsOrigin,
  isMcpOAuthPublicPath,
} from "../lib/cors-policy.js";

function req(method: string, url: string): FastifyRequest {
  return { method, url } as FastifyRequest;
}

describe("cors-policy MCP OAuth", () => {
  it("treats MCP OAuth paths as public", () => {
    expect(isMcpOAuthPublicPath("/oauth/register")).toBe(true);
    expect(isMcpOAuthPublicPath("/oauth/token")).toBe(true);
    expect(isMcpOAuthPublicPath("/oauth/revoke")).toBe(true);
    expect(isMcpOAuthPublicPath("/api/posts")).toBe(false);
  });

  it("allows missing Origin on MCP OAuth POSTs (Worker proxy)", () => {
    expect(allowsMissingCorsOrigin(req("POST", "/oauth/register"))).toBe(true);
    expect(allowsMissingCorsOrigin(req("POST", "/oauth/token"))).toBe(true);
    expect(allowsMissingCorsOrigin(req("POST", "/oauth/mcp/introspect"))).toBe(true);
    expect(allowsMissingCorsOrigin(req("POST", "/api/posts"))).toBe(false);
  });

  it("recognizes AI host browser origins for MCP OAuth CORS", () => {
    expect(isMcpOAuthCorsOrigin("https://claude.ai")).toBe(true);
    expect(isMcpOAuthCorsOrigin("https://www.claude.ai")).toBe(true);
    expect(isMcpOAuthCorsOrigin("https://chatgpt.com")).toBe(true);
    expect(isMcpOAuthCorsOrigin("https://chat.openai.com")).toBe(true);
    expect(isMcpOAuthCorsOrigin("https://cursor.com")).toBe(true);
    expect(isMcpOAuthCorsOrigin("https://social0.app")).toBe(false);
  });
});
