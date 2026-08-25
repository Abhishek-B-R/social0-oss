import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MCP_RESOURCES, listMcpResources, readMcpResource } from "./resources.js";

const HTTP_URL = /https:\/\/[^\s)]+/g;

describe("MCP resources", () => {
  it("lists at least one resource with mimeType", () => {
    const listed = listMcpResources();
    assert.ok(listed.length >= 1);
    for (const resource of listed) {
      assert.ok(resource.uri.length > 0);
      assert.ok(resource.name.length > 0);
      assert.equal(resource.mimeType, "text/markdown");
    }
  });

  it("reads every listed resource with non-empty markdown", () => {
    for (const listed of listMcpResources()) {
      const body = readMcpResource(listed.uri);
      assert.ok(body);
      assert.equal(body.uri, listed.uri);
      assert.equal(body.mimeType, listed.mimeType);
      assert.ok(body.text.trim().length > 40);
      assert.match(body.text, /^# /);
    }
  });

  it("returns null for unknown URIs", () => {
    assert.equal(readMcpResource("social0://docs/missing"), null);
  });

  it("embeds resolvable https URLs in resource bodies", () => {
    const urls = new Set<string>();
    for (const resource of MCP_RESOURCES) {
      for (const match of resource.text.matchAll(HTTP_URL)) {
        urls.add(match[0].replace(/[.,]+$/, ""));
      }
    }
    assert.ok(urls.has("https://api.social0.app/openapi.json"));
    assert.ok(urls.has("https://social0.app/developers"));
    assert.ok(urls.has("https://docs.social0.app/docs/integrations/mcp"));
    assert.ok(urls.has("https://docs.social0.app/docs/api"));
  });
});
