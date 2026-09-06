/**
 * User webhook delivery.
 *
 * The regression these pin: `post.published` was emitted fire-and-forget, so
 * on the Cloudflare publish worker the isolate was torn down before the
 * request left the edge and no delivery was ever attempted. Delivery must be
 * awaited, retried on transient failures, recorded, and emitted exactly once
 * per post even when platform jobs finish concurrently.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encryptToken,
  verifySocial0WebhookSignature,
} from "@social0/shared";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@/db", () => ({ db: mockDb }));

/** Drizzle-ish builder: every method returns itself, awaiting yields `result`. */
function chain(result: unknown = []): unknown {
  const promise = Promise.resolve(result);
  const proxy: unknown = new Proxy(promise, {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return (target[prop as "then"] as (...a: unknown[]) => unknown).bind(
          target,
        );
      }
      return () => proxy;
    },
  });
  return proxy;
}

const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user_1";
const SECRET = "test_webhook_secret_value";
const URL_UNDER_TEST = "https://hooks.example.com/webhooks/social0";

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBSCRIPTION_ID,
    userId: USER_ID,
    url: URL_UNDER_TEST,
    secret: encryptToken(SECRET, SUBSCRIPTION_ID),
    events: ["post.published", "post.failed"],
    ...overrides,
  };
}

function okResponse(status = 200) {
  return new Response("ok", { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: an unconsumed mockImplementationOnce
  // from an early-returning test would otherwise leak into the next one.
  vi.resetAllMocks();
  mockDb.select.mockImplementation(() => chain([]));
  mockDb.insert.mockImplementation(() => chain([]));
  mockDb.update.mockImplementation(() => chain([]));
  mockDb.delete.mockImplementation(() => chain([]));
  mockDb.execute.mockImplementation(() => Promise.resolve(undefined));
  fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deliverUserWebhookEvent", () => {
  it("awaits the HTTP request and reports the response code", async () => {
    mockDb.select.mockImplementationOnce(() => chain([subscriptionRow()]));
    const { deliverUserWebhookEvent } = await import(
      "../lib/user-webhook-delivery.js"
    );

    const outcomes = await deliverUserWebhookEvent(USER_ID, "post.published", {
      post_id: "post-1",
    });

    // The point of the fix: by the time the promise resolves the request is done.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      subscriptionId: SUBSCRIPTION_ID,
      status: "delivered",
      responseStatus: 200,
      attempts: 1,
      error: null,
    });
  });

  it("signs the exact body it sends", async () => {
    mockDb.select.mockImplementationOnce(() => chain([subscriptionRow()]));
    const { deliverUserWebhookEvent } = await import(
      "../lib/user-webhook-delivery.js"
    );

    await deliverUserWebhookEvent(USER_ID, "post.published", {
      post_id: "post-1",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_UNDER_TEST);
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["X-Social0-Event"]).toBe("post.published");
    expect(headers["X-Social0-Delivery-Id"]).toBeTruthy();
    expect(headers["X-Social0-Signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);

    const body = init.body as string;
    await expect(
      verifySocial0WebhookSignature(
        body,
        SECRET,
        headers["X-Social0-Signature"],
      ),
    ).resolves.toBe(true);

    const payload = JSON.parse(body) as Record<string, unknown>;
    expect(payload.type).toBe("post.published");
    expect(payload.id).toBe(headers["X-Social0-Delivery-Id"]);
    expect(payload.data).toEqual({ post_id: "post-1" });
  });

  it("skips subscriptions that did not ask for the event", async () => {
    mockDb.select.mockImplementationOnce(() =>
      chain([subscriptionRow({ events: ["post.scheduled"] })]),
    );
    const { deliverUserWebhookEvent } = await import(
      "../lib/user-webhook-delivery.js"
    );

    const outcomes = await deliverUserWebhookEvent(USER_ID, "post.published", {
      post_id: "post-1",
    });

    expect(outcomes).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a 500 and reports the attempt that succeeded", async () => {
    mockDb.select.mockImplementationOnce(() => chain([subscriptionRow()]));
    fetchMock
      .mockImplementationOnce(async () => okResponse(500))
      .mockImplementationOnce(async () => okResponse(202));

    const { deliverUserWebhookEvent } = await import(
      "../lib/user-webhook-delivery.js"
    );
    const [outcome] = await deliverUserWebhookEvent(
      USER_ID,
      "post.published",
      { post_id: "post-1" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({
      status: "delivered",
      responseStatus: 202,
      attempts: 2,
    });
  });

  it("does not retry a 400 — the endpoint rejected the request itself", async () => {
    mockDb.select.mockImplementationOnce(() => chain([subscriptionRow()]));
    fetchMock.mockImplementation(async () => okResponse(400));

    const { deliverUserWebhookEvent } = await import(
      "../lib/user-webhook-delivery.js"
    );
    const [outcome] = await deliverUserWebhookEvent(
      USER_ID,
      "post.published",
      { post_id: "post-1" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      status: "failed",
      responseStatus: 400,
      attempts: 1,
    });
    expect(outcome.error).toContain("400");
  });

  it(
    "gives up after the retry budget and records the last error",
    { timeout: 20_000 },
    async () => {
      mockDb.select.mockImplementationOnce(() => chain([subscriptionRow()]));
      fetchMock.mockImplementation(async () => okResponse(503));

      const { deliverUserWebhookEvent } = await import(
        "../lib/user-webhook-delivery.js"
      );
      const [outcome] = await deliverUserWebhookEvent(
        USER_ID,
        "post.published",
        { post_id: "post-1" },
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(outcome).toMatchObject({
        status: "failed",
        responseStatus: 503,
        attempts: 3,
      });
    },
  );

  it("blocks a private-network endpoint without sending anything", async () => {
    mockDb.select.mockImplementationOnce(() =>
      chain([subscriptionRow({ url: "http://169.254.169.254/latest/meta-data" })]),
    );
    const { deliverUserWebhookEvent } = await import(
      "../lib/user-webhook-delivery.js"
    );

    const [outcome] = await deliverUserWebhookEvent(
      USER_ID,
      "post.published",
      { post_id: "post-1" },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      status: "blocked",
      attempts: 0,
      responseStatus: null,
    });
  });

  it("records the attempt and stamps the subscription's last delivery", async () => {
    mockDb.select.mockImplementationOnce(() => chain([subscriptionRow()]));
    const inserted: unknown[] = [];
    mockDb.insert.mockImplementation(() => ({
      values: (row: unknown) => {
        inserted.push(row);
        return chain([]);
      },
    }));
    const updated: unknown[] = [];
    mockDb.update.mockImplementation(() => ({
      set: (row: unknown) => {
        updated.push(row);
        return chain([]);
      },
    }));

    const { deliverUserWebhookEvent } = await import(
      "../lib/user-webhook-delivery.js"
    );
    await deliverUserWebhookEvent(USER_ID, "post.published", {
      post_id: "post-1",
    });

    expect(inserted[0]).toMatchObject({
      subscriptionId: SUBSCRIPTION_ID,
      userId: USER_ID,
      event: "post.published",
      status: "delivered",
      responseStatus: 200,
      attempts: 1,
    });
    expect(updated[0]).toMatchObject({
      lastDeliveryStatus: "delivered",
      lastDeliveryResponseStatus: 200,
      lastDeliveryError: null,
    });
    // Old rows are trimmed so the log cannot grow without bound.
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
  });

  it("still delivers when the delivery log cannot be written", async () => {
    mockDb.select.mockImplementationOnce(() => chain([subscriptionRow()]));
    mockDb.insert.mockImplementation(() => {
      throw new Error('relation "webhook_deliveries" does not exist');
    });

    const { deliverUserWebhookEvent } = await import(
      "../lib/user-webhook-delivery.js"
    );
    const [outcome] = await deliverUserWebhookEvent(
      USER_ID,
      "post.published",
      { post_id: "post-1" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("delivered");
  });
});

describe("hasWebhookSubscriberFor", () => {
  it("is true only when an active subscription asked for the event", async () => {
    const { hasWebhookSubscriberFor } = await import(
      "../lib/user-webhook-delivery.js"
    );

    mockDb.select.mockImplementationOnce(() => chain([subscriptionRow()]));
    await expect(
      hasWebhookSubscriberFor(USER_ID, "post.published"),
    ).resolves.toBe(true);

    mockDb.select.mockImplementationOnce(() =>
      chain([subscriptionRow({ events: ["post.deleted"] })]),
    );
    await expect(
      hasWebhookSubscriberFor(USER_ID, "post.published"),
    ).resolves.toBe(false);

    mockDb.select.mockImplementationOnce(() => chain([]));
    await expect(
      hasWebhookSubscriberFor(USER_ID, "post.published"),
    ).resolves.toBe(false);
  });
});

describe("sendWebhookTestDelivery", () => {
  it("pings the endpoint regardless of its event filter", async () => {
    const { sendWebhookTestDelivery } = await import(
      "../lib/user-webhook-delivery.js"
    );

    const outcome = await sendWebhookTestDelivery({
      id: SUBSCRIPTION_ID,
      userId: USER_ID,
      url: URL_UNDER_TEST,
      secret: encryptToken(SECRET, SUBSCRIPTION_ID),
    });

    expect(outcome).toMatchObject({ status: "delivered", responseStatus: 200 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Social0-Event"]).toBe("webhook.test");
    await expect(
      verifySocial0WebhookSignature(
        init.body as string,
        SECRET,
        headers["X-Social0-Signature"],
      ),
    ).resolves.toBe(true);
  });

  it("reports an undecryptable secret instead of throwing", async () => {
    const { sendWebhookTestDelivery } = await import(
      "../lib/user-webhook-delivery.js"
    );

    const outcome = await sendWebhookTestDelivery({
      id: SUBSCRIPTION_ID,
      userId: USER_ID,
      url: URL_UNDER_TEST,
      secret: "not-an-encrypted-value",
    });

    expect(outcome.status).toBe("blocked");
    expect(outcome.error).toContain("secret");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
