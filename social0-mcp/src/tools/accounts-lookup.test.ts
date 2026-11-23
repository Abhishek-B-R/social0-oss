/**
 * publish_now / schedule_content / create_draft used to call GET /v1/accounts
 * on every invocation, even when the agent already passed account UUIDs. The
 * API validates those itself, so the lookup is skipped for UUID targets.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

process.env.SOCIAL0_MCP_NO_DOTENV = "true";
process.env.SOCIAL0_API_KEY = "sk_live_test";
process.env.SOCIAL0_API_URL = "http://api.test";
process.env.SOCIAL0_MAX_RETRIES = "1";

const { handlePublishNow } = await import("./handlers.js");

const realFetch = globalThis.fetch;
let paths: string[] = [];

beforeEach(() => {
  paths = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    paths.push(path);
    const body =
      path === "/v1/accounts"
        ? { accounts: [{ id: "11111111-1111-4111-8111-111111111111", platform: "linkedin", platform_username: "acme", is_active: true }] }
        : { post_id: "p1", tracking_id: "t1", status: "queued", stream_url: "/s" };
    return new Response(JSON.stringify(body), {
      status: path === "/v1/accounts" ? 200 : 202,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("account lookup for create/publish tools", () => {
  it("skips GET /v1/accounts when every target is an account UUID", async () => {
    await handlePublishNow({
      content: "hello",
      platforms: ["11111111-1111-4111-8111-111111111111"],
    });
    assert.deepEqual(paths, ["/v1/posts/publish"]);
  });

  it("still looks accounts up for platform names", async () => {
    await handlePublishNow({ content: "hello", platforms: ["linkedin"] });
    assert.equal(paths[0], "/v1/accounts");
  });
});
