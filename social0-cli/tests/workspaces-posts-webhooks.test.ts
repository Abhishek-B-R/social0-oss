/**
 * Wire contract for workspace scoping, the newer post actions, and webhooks:
 * method, path, query and JSON body for each wrapper.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClient, resetClient, withWorkspace } from "../src/api/client.js";
import { listAccounts } from "../src/api/accounts.js";
import { getMe } from "../src/api/me.js";
import {
  bulkDeletePosts,
  duplicatePost,
  postAgain,
  setAutoPlug,
  cancelAutoPlug,
  setAutoRepost,
  disableAutoRepost,
  getPostEvents,
} from "../src/api/posts.js";
import { listWorkspaces } from "../src/api/workspaces.js";
import {
  listWebhooks,
  createWebhook,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  listWebhookDeliveries,
  testWebhook,
} from "../src/api/webhooks.js";

const WS = "11111111-2222-3333-4444-555555555555";
const POST = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const HOOK = "99999999-8888-7777-6666-555555555555";

type Call = { url: string; init: RequestInit };
let calls: Call[];
let nextResponse: () => Response;

function json(body: unknown, status = 200) {
  return () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  nextResponse = json({});
  process.env.SOCIAL0_MAX_RETRIES = "0";
  delete process.env.SOCIAL0_WORKSPACE_ID;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return nextResponse();
    }),
  );
  resetClient();
  getClient("http://api.test").setApiKey("sk_live_test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SOCIAL0_MAX_RETRIES;
  delete process.env.SOCIAL0_WORKSPACE_ID;
  resetClient();
});

function last() {
  const call = calls[calls.length - 1]!;
  const url = new URL(call.url);
  return {
    method: call.init.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body: call.init.body ? JSON.parse(call.init.body as string) : undefined,
    headers: call.init.headers as Record<string, string>,
  };
}

describe("workspace scoping", () => {
  it("withWorkspace appends workspace_id to scoped paths, keeping existing query", () => {
    expect(withWorkspace("/posts", WS)).toBe(`/posts?workspace_id=${WS}`);
    expect(withWorkspace("/posts?limit=5", WS)).toBe(`/posts?limit=5&workspace_id=${WS}`);
    expect(withWorkspace("/media/upload", WS)).toBe(`/media/upload?workspace_id=${WS}`);
    expect(withWorkspace("/jobs/x/stream", WS)).toBe(`/jobs/x/stream?workspace_id=${WS}`);
  });

  it("withWorkspace leaves /me, /workspaces and /webhooks alone", () => {
    for (const p of ["/me", "/workspaces", "/webhooks", `/webhooks/${HOOK}/deliveries?limit=5`]) {
      expect(withWorkspace(p, WS)).toBe(p);
    }
  });

  it("withWorkspace is a no-op without a workspace", () => {
    expect(withWorkspace("/posts", undefined)).toBe("/posts");
  });

  it("sends workspace_id from SOCIAL0_WORKSPACE_ID on scoped requests only", async () => {
    process.env.SOCIAL0_WORKSPACE_ID = WS;
    nextResponse = json({ data: [] });
    await listAccounts();
    expect(last().query).toEqual({ workspace_id: WS });
    await listWorkspaces();
    expect(last().query).toEqual({});
    await listWebhooks();
    expect(last().query).toEqual({});
    nextResponse = json({ email: "a@b.c" });
    await getMe();
    expect(last().query).toEqual({});
  });

  it("surfaces the server's 403 message inside a workspace", async () => {
    process.env.SOCIAL0_WORKSPACE_ID = WS;
    nextResponse = json({ error: { code: "forbidden", message: "Your role can't publish here." } }, 403);
    const { formatApiError } = await import("../src/utils/errors.js");
    const err = await postAgain(POST).catch((e: unknown) => e);
    const text = formatApiError(err);
    expect(text).toContain("Your role can't publish here.");
    expect(text).toContain(`workspace ${WS}`);
  });
});

describe("post actions", () => {
  it("bulk-delete POSTs ids", async () => {
    nextResponse = json({ deleted: [POST], failed: [] });
    expect(await bulkDeletePosts([POST])).toEqual({ deleted: [POST], failed: [] });
    expect(last()).toMatchObject({ method: "POST", path: "/v1/posts/bulk-delete", body: { ids: [POST] } });
  });

  it("duplicate POSTs with an Idempotency-Key", async () => {
    nextResponse = json({ id: "new" }, 201);
    expect(await duplicatePost(POST)).toEqual({ id: "new" });
    expect(last()).toMatchObject({ method: "POST", path: `/v1/posts/${POST}/duplicate` });
    expect(last().headers["Idempotency-Key"]).toBeTruthy();
  });

  it("post-again POSTs with an Idempotency-Key", async () => {
    nextResponse = json({ post_id: "new", tracking_id: null, stream_url: null }, 202);
    expect((await postAgain(POST)).post_id).toBe("new");
    expect(last()).toMatchObject({ method: "POST", path: `/v1/posts/${POST}/post-again` });
    expect(last().headers["Idempotency-Key"]).toBeTruthy();
  });

  it("auto-plug PUTs the body and DELETE cancels", async () => {
    const body = { metric: "likes" as const, threshold: 100, message: "plug" };
    nextResponse = json({ post_id: POST, auto_plug: "watching" }, 201);
    await setAutoPlug(POST, body);
    expect(last()).toMatchObject({ method: "PUT", path: `/v1/posts/${POST}/auto-plug`, body });
    nextResponse = () => new Response(null, { status: 204 });
    await cancelAutoPlug(POST);
    expect(last()).toMatchObject({ method: "DELETE", path: `/v1/posts/${POST}/auto-plug` });
  });

  it("auto-repost PUTs the body and DELETE disables", async () => {
    nextResponse = json({ post_id: POST, schedule_id: "s1" });
    expect(await setAutoRepost(POST, { interval_hours: 24, max_reposts: 3 })).toEqual({
      post_id: POST,
      schedule_id: "s1",
    });
    expect(last()).toMatchObject({
      method: "PUT",
      path: `/v1/posts/${POST}/auto-repost`,
      body: { interval_hours: 24, max_reposts: 3 },
    });
    nextResponse = () => new Response(null, { status: 204 });
    await disableAutoRepost(POST);
    expect(last()).toMatchObject({ method: "DELETE", path: `/v1/posts/${POST}/auto-repost` });
  });

  it("events GETs the timeline", async () => {
    nextResponse = json({ postId: POST, events: [] });
    await getPostEvents(POST);
    expect(last()).toMatchObject({ method: "GET", path: `/v1/posts/${POST}/events` });
  });
});

describe("workspaces and webhooks", () => {
  it("lists workspaces", async () => {
    const ws = { id: WS, name: "Main", team_id: "t", team_name: "T", role: "admin", active: true, permissions: [] };
    nextResponse = json({ data: [ws] });
    expect(await listWorkspaces()).toEqual([ws]);
    expect(last()).toMatchObject({ method: "GET", path: "/v1/workspaces" });
  });

  it("covers every webhook route", async () => {
    nextResponse = json({ data: [] });
    await listWebhooks();
    expect(last()).toMatchObject({ method: "GET", path: "/v1/webhooks" });

    nextResponse = json({ id: HOOK, secret: "shh" }, 201);
    const created = await createWebhook({ url: "https://x.test/h", events: ["post.published"] });
    expect(created.secret).toBe("shh");
    expect(last()).toMatchObject({
      method: "POST",
      path: "/v1/webhooks",
      body: { url: "https://x.test/h", events: ["post.published"] },
    });

    nextResponse = json({ id: HOOK });
    await getWebhook(HOOK);
    expect(last()).toMatchObject({ method: "GET", path: `/v1/webhooks/${HOOK}` });

    await updateWebhook(HOOK, { active: false });
    expect(last()).toMatchObject({ method: "PATCH", path: `/v1/webhooks/${HOOK}`, body: { active: false } });

    nextResponse = json({ data: [], next_before: null });
    await listWebhookDeliveries(HOOK, { limit: 5, before: "c1" });
    expect(last()).toMatchObject({
      method: "GET",
      path: `/v1/webhooks/${HOOK}/deliveries`,
      query: { limit: "5", before: "c1" },
    });

    nextResponse = json({ status: "delivered" });
    await testWebhook(HOOK);
    expect(last()).toMatchObject({ method: "POST", path: `/v1/webhooks/${HOOK}/test` });

    nextResponse = () => new Response(null, { status: 204 });
    await deleteWebhook(HOOK);
    expect(last()).toMatchObject({ method: "DELETE", path: `/v1/webhooks/${HOOK}` });
  });
});
