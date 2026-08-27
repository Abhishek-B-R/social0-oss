import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontendPublic = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../frontend/public",
);

function readPublic(rel: string): string {
  return readFileSync(resolve(frontendPublic, rel), "utf8");
}

describe("developer discovery files", () => {
  it("serves a valid AI Catalog", () => {
    const catalog = JSON.parse(readPublic(".well-known/ai-catalog.json"));
    expect(catalog.specVersion).toBe("1.0");
    expect(catalog.host.displayName).toBe("Social0");
    expect(catalog.entries.length).toBeGreaterThan(0);
    for (const entry of catalog.entries) {
      expect(entry.identifier).toMatch(/^urn:air:social0\.app:/);
      expect(entry.displayName).toBeTruthy();
      expect(entry.type).toBeTruthy();
      expect(entry.url).toMatch(/^https:\/\//);
    }
  });

  it("serves a valid RFC 9727 api-catalog linkset", () => {
    const catalog = JSON.parse(readPublic(".well-known/api-catalog"));
    expect(Array.isArray(catalog.linkset)).toBe(true);
    expect(catalog.linkset[0]["service-desc"][0].href).toContain("openapi.json");
  });

  it("publishes Social0-named auth and developer markdown", () => {
    expect(readPublic("auth.md")).toMatch(/^# Social0 API authentication/m);
    expect(readPublic("developers.md")).toMatch(/^# Social0 developer resources/m);
    expect(readPublic("llms.txt")).toContain("https://social0.app/developers");
    expect(readPublic("llms.txt")).toContain("https://api.social0.app/openapi.json");
    expect(readPublic("llms.txt")).toContain("https://mcp.social0.app");
    expect(readPublic("llms.txt")).not.toContain("sandbox.md");
  });

  it("does not block auth.md in robots.txt", () => {
    const robots = readPublic("robots.txt");
    expect(robots).toContain("Allow: /auth.md");
    expect(robots).not.toMatch(/^Disallow: \/auth$/m);
  });
});
