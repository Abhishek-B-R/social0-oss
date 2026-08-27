import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractMcpMethods,
  handlePublicJsonRpcMessage,
  isPublicMcpMethod,
  tryHandlePublicJsonRpc,
} from "./public-rpc.js";

describe("public MCP JSON-RPC", () => {
  it("treats discovery methods as public", () => {
    assert.equal(isPublicMcpMethod("initialize"), true);
    assert.equal(isPublicMcpMethod("resources/list"), true);
    assert.equal(isPublicMcpMethod("resources/read"), true);
    assert.equal(isPublicMcpMethod("tools/call"), false);
  });

  it("extracts methods from single and batch bodies", () => {
    assert.deepEqual(
      extractMcpMethods({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      ["initialize"],
    );
    assert.deepEqual(
      extractMcpMethods([
        { jsonrpc: "2.0", id: 1, method: "resources/list" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]),
      ["resources/list", "tools/list"],
    );
  });

  it("initialize advertises the resources capability", () => {
    const handled = handlePublicJsonRpcMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test" } },
    });
    assert.equal(handled?.kind, "response");
    if (handled?.kind !== "response") return;
    const result = handled.body.result as {
      capabilities: { resources?: unknown; tools?: unknown };
    };
    assert.ok(result.capabilities.resources);
    assert.ok(result.capabilities.tools);
  });

  it("lists at least one readable resource", async () => {
    const listResponse = tryHandlePublicJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/list",
    });
    assert.ok(listResponse);
    const listBody = (await listResponse.json()) as {
      result: { resources: Array<{ uri: string; mimeType: string }> };
    };
    assert.ok(listBody.result.resources.length >= 1);

    const uri = listBody.result.resources[0].uri;
    const readResponse = tryHandlePublicJsonRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/read",
      params: { uri },
    });
    assert.ok(readResponse);
    const readBody = (await readResponse.json()) as {
      result: { contents: Array<{ mimeType: string; text: string }> };
    };
    assert.equal(readBody.result.contents[0].mimeType, "text/markdown");
    assert.ok(readBody.result.contents[0].text.length > 40);
  });
});
