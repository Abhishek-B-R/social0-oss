/**
 * Finalize marks the post once it has run to the end.
 *
 * `recordPlatformResultServer`, the CF worker, `executePublish` and the posts
 * list all move a post to its terminal status before finalize runs, so the
 * status cannot tell the background worker which posts still owe their
 * failure email, webhook, Auto-Plug / Auto-Repost setup and queue-slot
 * settlement. The marker can: the unfinalized-post sweep finalizes terminal
 * posts that lack it. It must be the last step, so a finalize that throws
 * part way leaves the post for the sweep.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  order: [] as string[],
  deliver: vi.fn(),
  hasSubscriber: vi.fn(),
  failureEmail: vi.fn(),
  bulkSetup: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  db: { select: h.select, update: h.update },
}));
vi.mock("../lib/post-failure-email.js", () => ({
  maybeSendPostFailureEmail: h.failureEmail,
}));
vi.mock("../publish/bulk-auto-features.js", () => ({
  setupBulkAutoFeaturesAfterPublish: h.bulkSetup,
}));
vi.mock("../lib/user-webhook-delivery.js", () => ({
  deliverUserWebhookEvent: h.deliver,
  hasWebhookSubscriberFor: h.hasSubscriber,
}));

import { maybeFinalizePostPublish } from "../publish/finalize-post.js";
import {
  markPostFinalized,
  POST_FINALIZED_KEY,
} from "../lib/post-metadata-claim.js";
import { sanitizePostMetadata } from "../lib/post-metadata-sanitize.js";

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
      if (prop === "set") {
        return (values: Record<string, unknown>) => {
          h.set(values);
          if ("metadata" in values && !("status" in values)) {
            h.order.push("metadata");
          }
          return proxy;
        };
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

/** The metadata writes that set the finalized marker. */
function finalizedMarks(): unknown[] {
  const dialect = new PgDialect();
  return h.set.mock.calls
    .map(([values]) => (values as { metadata?: unknown }).metadata)
    .filter(
      (m) =>
        m &&
        dialect
          .sqlToQuery(m as Parameters<PgDialect["sqlToQuery"]>[0])
          .params.includes(POST_FINALIZED_KEY),
    );
}

beforeEach(() => {
  vi.resetAllMocks();
  h.order = [];
  h.select.mockImplementation(() => chain([]));
  h.update.mockImplementation(() => chain([{ id: POST_ID }]));
  h.hasSubscriber.mockResolvedValue(true);
  h.deliver.mockImplementation(async () => {
    h.order.push("webhook");
    return [];
  });
  h.failureEmail.mockImplementation(async () => {
    h.order.push("email");
  });
  h.bulkSetup.mockImplementation(async () => {
    h.order.push("bulk");
  });
});

describe("maybeFinalizePostPublish finalized marker", () => {
  it("marks the post finalized after every side effect has run", async () => {
    h.select.mockImplementationOnce(() =>
      chain([pub("published", "twitter_x"), pub("failed", "linkedin")]),
    );

    await maybeFinalizePostPublish(POST_ID, USER_ID);

    expect(finalizedMarks()).toHaveLength(1);
    // The webhook claim is a metadata write too; the marker is the last one.
    expect(h.order.slice(0, 2)).toEqual(["bulk", "email"]);
    expect(h.order.at(-1)).toBe("metadata");
    expect(h.order.indexOf("webhook")).toBeLessThan(h.order.length - 1);
  });

  it("does not mark a post whose deliveries are still running", async () => {
    h.select.mockImplementationOnce(() =>
      chain([pub("published", "twitter_x"), pub("publishing", "linkedin")]),
    );

    await maybeFinalizePostPublish(POST_ID, USER_ID);

    expect(finalizedMarks()).toHaveLength(0);
  });

  it("leaves the post unmarked for the sweep when a step throws", async () => {
    h.select.mockImplementationOnce(() => chain([pub("failed", "linkedin")]));
    h.failureEmail.mockRejectedValue(new Error("resend down"));

    await expect(maybeFinalizePostPublish(POST_ID, USER_ID)).rejects.toThrow(
      "resend down",
    );

    expect(finalizedMarks()).toHaveLength(0);
  });
});

describe("markPostFinalized", () => {
  it("merges the marker into metadata without bumping updatedAt", async () => {
    await markPostFinalized(POST_ID);

    expect(h.set).toHaveBeenCalledTimes(1);
    const values = h.set.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(values)).toEqual(["metadata"]);
    const { sql, params } = new PgDialect().sqlToQuery(
      values.metadata as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    expect(sql).toContain("coalesce");
    expect(sql).toContain("jsonb_build_object");
    expect(params[0]).toBe(POST_FINALIZED_KEY);
  });

  it("is reserved: a client cannot pre-set it to hide a post from the sweep", () => {
    expect(
      sanitizePostMetadata({ [POST_FINALIZED_KEY]: "2026-01-01", keep: 1 }),
    ).toEqual({ keep: 1 });
  });
});
