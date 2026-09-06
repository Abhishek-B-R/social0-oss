/**
 * Publish webhooks emitted from finalize.
 *
 * Two properties matter and both were broken or at risk:
 *  - the delivery is awaited, so the Cloudflare publish worker cannot resolve
 *    its queue handler (and drop the isolate) before the request goes out;
 *  - exactly one event per post, even though platform jobs finalize
 *    concurrently and the last two can both see every row terminal.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockDeliver, mockHasSubscriber, mockFailureEmail } = vi.hoisted(
  () => ({
    mockDb: {
      select: vi.fn(),
      update: vi.fn(),
    },
    mockDeliver: vi.fn(),
    mockHasSubscriber: vi.fn(),
    mockFailureEmail: vi.fn(),
  }),
);

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("../lib/post-failure-email.js", () => ({
  maybeSendPostFailureEmail: mockFailureEmail,
}));
vi.mock("../lib/user-webhook-delivery.js", () => ({
  deliverUserWebhookEvent: mockDeliver,
  hasWebhookSubscriberFor: mockHasSubscriber,
}));

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

const POST_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user_1";

function pub(status: string, platform = "linkedin") {
  return {
    status,
    platform,
    platformUsername: "acme",
    connectedAccountId: `acct_${platform}`,
    lastError: status === "failed" ? "boom" : null,
  };
}

/** First select = publication rows; first update = the one-shot claim. */
function arrange(pubs: unknown[], claimGranted = true) {
  mockDb.select.mockImplementationOnce(() => chain(pubs));
  mockDb.update.mockImplementationOnce(() =>
    chain(claimGranted ? [{ id: POST_ID }] : []),
  );
}

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: an unconsumed mockImplementationOnce
  // from an early-returning test would otherwise leak into the next one.
  vi.resetAllMocks();
  mockDb.select.mockImplementation(() => chain([]));
  mockDb.update.mockImplementation(() => chain([]));
  mockDeliver.mockResolvedValue([]);
  mockHasSubscriber.mockResolvedValue(true);
  mockFailureEmail.mockResolvedValue(undefined);
});

describe("emitPublishWebhooksForPost", () => {
  it("awaits the delivery before it resolves", async () => {
    arrange([pub("published")]);
    let delivered = false;
    mockDeliver.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      delivered = true;
      return [];
    });

    const { emitPublishWebhooksForPost } = await import(
      "../publish/finalize-post.js"
    );
    await emitPublishWebhooksForPost(POST_ID, USER_ID);

    expect(delivered).toBe(true);
    expect(mockDeliver).toHaveBeenCalledWith(
      USER_ID,
      "post.published",
      expect.objectContaining({ post_id: POST_ID, status: "published" }),
    );
  });

  it("sends post.published with status partial when only some platforms failed", async () => {
    arrange([pub("published"), pub("failed", "instagram")]);

    const { emitPublishWebhooksForPost } = await import(
      "../publish/finalize-post.js"
    );
    await emitPublishWebhooksForPost(POST_ID, USER_ID);

    expect(mockDeliver).toHaveBeenCalledWith(
      USER_ID,
      "post.published",
      expect.objectContaining({ status: "partial" }),
    );
  });

  it("sends post.failed when every platform failed", async () => {
    arrange([pub("failed"), pub("failed", "instagram")]);

    const { emitPublishWebhooksForPost } = await import(
      "../publish/finalize-post.js"
    );
    await emitPublishWebhooksForPost(POST_ID, USER_ID);

    expect(mockDeliver).toHaveBeenCalledWith(
      USER_ID,
      "post.failed",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("stays quiet while a platform is still publishing", async () => {
    arrange([pub("published"), pub("publishing", "instagram")]);

    const { emitPublishWebhooksForPost } = await import(
      "../publish/finalize-post.js"
    );
    await emitPublishWebhooksForPost(POST_ID, USER_ID);

    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it("emits nothing when another concurrent finalize already claimed the post", async () => {
    arrange([pub("published")], false);

    const { emitPublishWebhooksForPost } = await import(
      "../publish/finalize-post.js"
    );
    await emitPublishWebhooksForPost(POST_ID, USER_ID);

    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it("does not touch post metadata when the user has no webhooks", async () => {
    arrange([pub("published")]);
    mockHasSubscriber.mockResolvedValue(false);

    const { emitPublishWebhooksForPost } = await import(
      "../publish/finalize-post.js"
    );
    await emitPublishWebhooksForPost(POST_ID, USER_ID);

    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it("hands the claim back when nothing could be attempted", async () => {
    arrange([pub("published")]);
    mockDeliver.mockRejectedValue(new Error("database unavailable"));

    const { emitPublishWebhooksForPost } = await import(
      "../publish/finalize-post.js"
    );
    await expect(
      emitPublishWebhooksForPost(POST_ID, USER_ID),
    ).resolves.toBeUndefined();

    // claim + release
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });
});
