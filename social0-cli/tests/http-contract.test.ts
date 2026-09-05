/**
 * Mocked HTTP contract per analytics / inbox route group.
 *
 * The query-string builders are covered elsewhere; these pin what actually
 * goes over the wire (method, path, auth header, JSON body) and what comes
 * back, so a drift in the API client is caught here rather than only by the
 * server-side OpenAPI test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClient, resetClient, Social0ApiError } from "../src/api/client.js";
import { getAnalyticsOverview, getPostAnalytics } from "../src/api/analytics.js";
import { listInboxComments, listInboxDms, replyToComment } from "../src/api/inbox.js";
import { fetchWithOneAutoPage, isEmptyPageWithMore } from "../src/api/paging.js";
import { formatApiError } from "../src/utils/errors.js";

type Call = { url: string; init: RequestInit };

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

let calls: Call[];
let responses: Response[];

beforeEach(() => {
  calls = [];
  responses = [];
  process.env.SOCIAL0_MAX_RETRIES = "0";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error(`unexpected request ${init.method} ${url}`);
      return next;
    }),
  );
  resetClient();
  getClient("http://api.test").setApiKey("sk_live_test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SOCIAL0_MAX_RETRIES;
  resetClient();
});

function lastCall(): Call {
  return calls[calls.length - 1]!;
}

function headersOf(call: Call): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

describe("analytics overview", () => {
  it("GETs /v1/analytics/overview with the window and returns the body as-is", async () => {
    const body = {
      range: "28d",
      since: "2026-02-01T00:00:00.000Z",
      until: "2026-03-01T00:00:00.000Z",
      fetched_at: "2026-03-01T00:00:01.000Z",
      sampled: false,
      sample_limit: 12,
      partial: false,
      totals: { views: 10, likes: 2, comments: 0, shares: 0, reposts: 0, quotes: 0, engagement: 2 },
      by_platform: [],
      series: [],
      top_posts: [],
      publications: [],
      accounts_needing_reconnect: [],
    };
    responses.push(jsonResponse(body));
    const out = await getAnalyticsOverview({ range: "28d", accountId: "acc-1", fresh: true });
    expect(out).toEqual(body);
    const call = lastCall();
    const url = new URL(call.url);
    expect(call.init.method).toBe("GET");
    expect(url.pathname).toBe("/v1/analytics/overview");
    expect(url.searchParams.get("range")).toBe("28d");
    expect(url.searchParams.get("account_id")).toBe("acc-1");
    expect(url.searchParams.get("fresh")).toBe("1");
    expect(headersOf(call).Authorization).toBe("Bearer sk_live_test");
    expect(call.init.body).toBeUndefined();
  });
});

describe("post analytics", () => {
  it("GETs /v1/analytics/posts/{id} with the id URL-encoded", async () => {
    responses.push(
      jsonResponse({
        post_id: "p/1",
        fetched_at: "x",
        partial: false,
        totals: {},
        publications: [],
        accounts_needing_reconnect: [],
      }),
    );
    await getPostAnalytics("p/1");
    expect(new URL(lastCall().url).pathname).toBe("/v1/analytics/posts/p%2F1");
  });
});

describe("comments page", () => {
  const emptyWithMore = {
    range: "7d",
    since: "s",
    until: "u",
    fetched_at: "f",
    threads: [],
    has_more: true,
    next_before: "2026-02-20T00:00:00.000Z",
    sampled: true,
    sample_limit: 12,
    unsupported: [],
    accounts_needing_reconnect: [],
    fetch_errors: [],
    notices: [],
  };

  it("follows next_before exactly once when the first page is empty", async () => {
    const thread = {
      comment: { id: "c1", publication_id: "pub-1", platform: "bluesky", text: "hi" },
      replies: [],
      answered: false,
    };
    responses.push(jsonResponse(emptyWithMore));
    responses.push(jsonResponse({ ...emptyWithMore, threads: [thread], has_more: false, next_before: null }));

    const { page, autoPaged } = await fetchWithOneAutoPage(
      (before) => listInboxComments({ range: "7d", before }),
      (p) => p.threads,
      undefined,
    );
    expect(autoPaged).toBe(true);
    expect(page.threads).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[0]!.url).searchParams.get("before")).toBeNull();
    expect(new URL(calls[1]!.url).searchParams.get("before")).toBe(emptyWithMore.next_before);
    expect(new URL(calls[1]!.url).pathname).toBe("/v1/inbox/comments");
  });

  it("stops after one auto-page and reports the cursor when still empty", async () => {
    responses.push(jsonResponse(emptyWithMore));
    responses.push(jsonResponse({ ...emptyWithMore, next_before: "2026-02-10T00:00:00.000Z" }));
    const { page, autoPaged } = await fetchWithOneAutoPage(
      (before) => listInboxComments({ before }),
      (p) => p.threads,
      undefined,
    );
    expect(autoPaged).toBe(true);
    expect(calls).toHaveLength(2);
    expect(isEmptyPageWithMore(page, page.threads)).toBe(true);
    expect(page.next_before).toBe("2026-02-10T00:00:00.000Z");
  });

  it("does not auto-page when the page has results or the list is exhausted", async () => {
    responses.push(jsonResponse({ ...emptyWithMore, has_more: false, next_before: null }));
    const { autoPaged } = await fetchWithOneAutoPage(
      (before) => listInboxComments({ before }),
      (p) => p.threads,
      undefined,
    );
    expect(autoPaged).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe("DM list", () => {
  it("GETs /v1/inbox/dms and exposes conversations + cursor", async () => {
    responses.push(
      jsonResponse({
        range: "7d",
        since: "s",
        until: "u",
        fetched_at: "f",
        conversations: [{ conversation_id: "conv-1", platform: "twitter_x", account_id: "acc-1" }],
        has_more: true,
        next_before: "2026-02-01T00:00:00.000Z",
        sampled: false,
        sample_limit: 8,
        unsupported: [],
        accounts_needing_reconnect: [],
        fetch_errors: [],
        notices: [],
      }),
    );
    const out = await listInboxDms({ range: "7d", accountId: "acc-1", limit: 5 });
    const url = new URL(lastCall().url);
    expect(url.pathname).toBe("/v1/inbox/dms");
    expect(url.searchParams.get("account_id")).toBe("acc-1");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(out.conversations[0]!.conversation_id).toBe("conv-1");
    expect(out.next_before).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("comment reply mutation", () => {
  it("POSTs JSON with publication_id to /v1/inbox/comments/{id}/reply", async () => {
    responses.push(jsonResponse({ ok: true, reply_id: "r-9" }));
    const out = await replyToComment("c/1", {
      publication_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      text: "thanks",
    });
    expect(out).toEqual({ ok: true, reply_id: "r-9" });
    const call = lastCall();
    expect(call.init.method).toBe("POST");
    expect(new URL(call.url).pathname).toBe("/v1/inbox/comments/c%2F1/reply");
    expect(headersOf(call)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(call.init.body))).toEqual({
      publication_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      text: "thanks",
    });
  });

  it("surfaces a 400 from the verifier as a typed API error", async () => {
    responses.push(
      jsonResponse(
        { error: { code: "validation_error", message: "Comment is not on this publication." } },
        { status: 400 },
      ),
    );
    await expect(
      replyToComment("c1", { publication_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", text: "x" }),
    ).rejects.toMatchObject({
      name: "Social0ApiError",
      status: 400,
      code: "validation_error",
      message: "Comment is not on this publication.",
    });
  });
});

describe("rate limit", () => {
  it("carries Retry-After into the error and the user-facing message", async () => {
    responses.push(
      jsonResponse(
        { error: { code: "rate_limit_exceeded", message: "Too many requests. Try again later." } },
        { status: 429, headers: { "Retry-After": "17" } },
      ),
    );
    let caught: unknown;
    try {
      await getAnalyticsOverview({});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Social0ApiError);
    const err = caught as Social0ApiError;
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(17);
    const text = formatApiError(err);
    expect(text).toContain("Retry after 17s");
    expect(text).toContain("per-minute budget");
  });
});
