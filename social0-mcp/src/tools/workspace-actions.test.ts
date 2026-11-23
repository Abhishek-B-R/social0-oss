/**
 * Workspaces, account, post-action and webhook tools: what they advertise and
 * what they send to /v1.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

process.env.SOCIAL0_MCP_NO_DOTENV = "true";
process.env.SOCIAL0_API_KEY = "sk_live_test";
process.env.SOCIAL0_API_URL = "http://api.test";
process.env.SOCIAL0_MAX_RETRIES = "0";

const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
const { withWorkspaceId } = await import("../api/client.js");
const { ACCOUNT_LEVEL_TOOLS, TOOL_DEFINITIONS, annotationsFor } = await import("./definitions.js");
const { createMcpServer } = await import("./index.js");

const WS = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const POST = "9b2c1a7e-0000-4000-8000-000000000001";

const NEW_TOOLS = [
  "whoami",
  "list_workspaces",
  "connect_account",
  "disconnect_account",
  "delete_posts",
  "duplicate_post",
  "post_again",
  "set_auto_plug",
  "cancel_auto_plug",
  "set_auto_repost",
  "cancel_auto_repost",
  "get_post_events",
  "list_webhooks",
  "create_webhook",
  "get_webhook",
  "update_webhook",
  "delete_webhook",
  "list_webhook_deliveries",
  "test_webhook",
];

describe("withWorkspaceId", () => {
  it("appends workspace_id to scoped paths", () => {
    assert.equal(withWorkspaceId("/posts", WS), `/posts?workspace_id=${WS}`);
    assert.equal(withWorkspaceId("/posts?limit=5", WS), `/posts?limit=5&workspace_id=${WS}`);
    assert.equal(withWorkspaceId("/inbox/dms/c1?account_id=a", WS), `/inbox/dms/c1?account_id=a&workspace_id=${WS}`);
    assert.equal(withWorkspaceId("/jobs/t1", WS), `/jobs/t1?workspace_id=${WS}`);
  });

  it("leaves account-level paths and unscoped calls alone", () => {
    for (const path of ["/me", "/workspaces", "/webhooks", "/webhooks/x/deliveries?limit=5"]) {
      assert.equal(withWorkspaceId(path, WS), path);
    }
    assert.equal(withWorkspaceId("/posts", undefined), "/posts");
  });
});

describe("new tool definitions", () => {
  it("advertises every new tool with annotations", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    for (const name of NEW_TOOLS) {
      assert.ok(names.includes(name), `${name} missing from tools/list`);
      assert.ok(annotationsFor(name), `${name} has no annotations`);
    }
    for (const name of ["delete_posts", "disconnect_account", "delete_webhook", "cancel_auto_plug", "cancel_auto_repost"]) {
      assert.equal(annotationsFor(name)?.destructiveHint, true, name);
    }
  });

  it("offers workspace_id on scoped tools only", () => {
    for (const tool of TOOL_DEFINITIONS) {
      const has = "workspace_id" in (tool.inputSchema.properties ?? {});
      assert.equal(has, !ACCOUNT_LEVEL_TOOLS.has(tool.name), tool.name);
    }
  });
});

type Call = { url: URL; method: string; body: unknown; headers: Record<string, string> };
const realFetch = globalThis.fetch;
let calls: Call[] = [];
let responses: Response[] = [];

beforeEach(() => {
  calls = [];
  responses = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: new URL(String(url)),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request ${init?.method} ${String(url)}`);
    return next;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function callTool(name: string, args: Record<string, unknown>) {
  const server = createMcpServer();
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  return result as { isError?: boolean; content: { type: string; text: string }[] };
}

describe("tool calls over /v1", () => {
  it("sends workspace_id from any scoped tool", async () => {
    responses.push(json({ data: [], pagination: { total: 0 } }));
    const result = await callTool("list_posts", { workspace_id: WS, limit: 5 });
    assert.equal(result.isError, false);
    assert.equal(calls[0]!.url.pathname, "/v1/posts");
    assert.equal(calls[0]!.url.searchParams.get("workspace_id"), WS);
  });

  it("does not send workspace_id without one, nor to webhooks", async () => {
    responses.push(json({ data: [] }), json({ data: [] }));
    await callTool("list_accounts", {});
    await callTool("list_webhooks", { workspace_id: WS });
    assert.equal(calls[0]!.url.search, "");
    assert.equal(calls[1]!.url.pathname, "/v1/webhooks");
    assert.equal(calls[1]!.url.search, "");
  });

  it("rejects a workspace_id that is not a UUID before calling the API", async () => {
    const result = await callTool("list_posts", { workspace_id: "team-a" });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /workspace_id/);
    assert.equal(calls.length, 0);
  });

  it("tells the model a workspace 403 is a role limit", async () => {
    responses.push(
      json(
        {
          error: {
            code: "forbidden",
            message: "Your role in this workspace (analyst) can't do this.",
            details: { required_permission: "delete_posts" },
          },
        },
        403,
      ),
    );
    const result = await callTool("delete_posts", { workspace_id: WS, ids: [POST] });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /analyst.*needs delete_posts.*role cannot do this/s);
  });

  it("bulk-deletes with POST /posts/bulk-delete", async () => {
    responses.push(json({ deleted: 1, failed: [] }));
    await callTool("delete_posts", { ids: [POST] });
    assert.equal(calls[0]!.method, "POST");
    assert.equal(calls[0]!.url.pathname, "/v1/posts/bulk-delete");
    assert.deepEqual(calls[0]!.body, { ids: [POST] });
  });

  it("post_again sends an Idempotency-Key and no body", async () => {
    responses.push(json({ post_id: "p2", tracking_id: "t1", stream_url: "/v1/jobs/t1/stream" }, 202));
    const result = await callTool("post_again", { post_id: POST });
    assert.equal(calls[0]!.method, "POST");
    assert.equal(calls[0]!.url.pathname, `/v1/posts/${POST}/post-again`);
    assert.equal(calls[0]!.body, undefined);
    assert.match(calls[0]!.headers["Idempotency-Key"] ?? "", /^mcp-post_again-/);
    assert.match(result.content[0]!.text, /tracking_id=t1/);
  });

  it("set_auto_plug PUTs the body without post_id", async () => {
    responses.push(json({ post_id: POST, auto_plug: "watching" }, 201));
    await callTool("set_auto_plug", { post_id: POST, metric: "likes", threshold: 50, message: "Thanks!" });
    assert.equal(calls[0]!.method, "PUT");
    assert.equal(calls[0]!.url.pathname, `/v1/posts/${POST}/auto-plug`);
    assert.deepEqual(calls[0]!.body, { metric: "likes", threshold: 50, message: "Thanks!" });
  });

  it("cancel_auto_repost DELETEs and handles 204", async () => {
    responses.push(new Response(null, { status: 204 }));
    const result = await callTool("cancel_auto_repost", { post_id: POST });
    assert.equal(result.isError, false);
    assert.equal(calls[0]!.method, "DELETE");
    assert.equal(calls[0]!.url.pathname, `/v1/posts/${POST}/auto-repost`);
  });

  it("update_webhook PATCHes only the given fields", async () => {
    responses.push(json({ id: POST, active: false }));
    await callTool("update_webhook", { webhook_id: POST, active: false });
    assert.equal(calls[0]!.method, "PATCH");
    assert.equal(calls[0]!.url.pathname, `/v1/webhooks/${POST}`);
    assert.deepEqual(calls[0]!.body, { active: false });
  });

  it("connect_account POSTs the platform", async () => {
    responses.push(json({ authorization_url: "https://www.linkedin.com/oauth" }));
    const result = await callTool("connect_account", { platform: "linkedin" });
    assert.deepEqual(calls[0]!.body, { platform: "linkedin" });
    assert.match(result.content[0]!.text, /authorization_url/);
  });
});
