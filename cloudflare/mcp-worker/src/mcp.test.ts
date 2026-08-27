import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { peekMcpMethods } from "./mcp.js";

describe("peekMcpMethods", () => {
  it("reads initialize from a JSON POST", async () => {
    const request = new Request("https://mcp.social0.app/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    assert.deepEqual(await peekMcpMethods(request), ["initialize"]);
  });

  it("returns no methods for GET", async () => {
    const request = new Request("https://mcp.social0.app/mcp");
    assert.deepEqual(await peekMcpMethods(request), []);
  });
});
