import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedis, mockDb } = vi.hoisted(() => ({
  mockRedis: { set: vi.fn(), del: vi.fn() },
  mockDb: {
    query: { verification: { findFirst: vi.fn() } },
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../lib/redis.js", () => ({ redis: mockRedis }));
vi.mock("../db/index.js", () => ({ db: mockDb }));

import {
  claimWebhookDelivery,
  releaseWebhookDelivery,
} from "../lib/webhook-idempotency.js";

describe("webhook idempotency claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.del.mockResolvedValue(1);
  });

  it("processes the first delivery and skips a duplicate", async () => {
    mockRedis.set.mockResolvedValueOnce("OK");
    expect(await claimWebhookDelivery("wh_1")).toBe(true);

    mockRedis.set.mockResolvedValueOnce(null);
    expect(await claimWebhookDelivery("wh_1")).toBe(false);
  });

  /**
   * The claim is taken before the handler runs. Without a release, a handler
   * that throws answers 500, and the provider's retry of the same webhook id
   * is swallowed as a duplicate — the billing event is lost for good.
   */
  it("releases the claim so a provider retry is processed again", async () => {
    mockRedis.set.mockResolvedValueOnce("OK");
    expect(await claimWebhookDelivery("wh_2")).toBe(true);

    await releaseWebhookDelivery("wh_2");
    expect(mockRedis.del).toHaveBeenCalledWith("dodo:wh:wh_2");

    mockRedis.set.mockResolvedValueOnce("OK");
    expect(await claimWebhookDelivery("wh_2")).toBe(true);
  });

  it("never throws out of the release path", async () => {
    mockRedis.del.mockRejectedValueOnce(new Error("redis down"));
    await expect(releaseWebhookDelivery("wh_3")).resolves.toBeUndefined();
  });
});
