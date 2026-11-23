import { beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();

vi.mock("dodopayments", () => ({
  default: vi.fn(() => ({ payments: { list } })),
}));
vi.mock("../lib/env.js", () => ({
  env: { DODO_PAYMENTS_API_KEY: "test_key", DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
}));
vi.mock("../db/index.js", () => ({ db: {} }));
vi.mock("./../lib/subscription.js", () => ({ getSubscriptionForUser: vi.fn() }));

const { findRecentPaidUpgradePayment } = await import("../lib/billing-guards.js");
const { isUniqueViolation } = await import("../lib/pg-errors.js");

const paid = (createdAt: string) => ({
  payment_id: "pay_1",
  status: "succeeded",
  total_amount: 1900,
  created_at: createdAt,
});

describe("findRecentPaidUpgradePayment with the last plan change", () => {
  beforeEach(() => list.mockReset());

  it("rejects a payment made before the plan last changed", async () => {
    list.mockResolvedValue({ items: [paid("2026-10-01T10:00:00.000Z")] });
    const result = await findRecentPaidUpgradePayment(
      "sub_1",
      new Date("2026-10-05T10:00:00.000Z"),
    );
    expect(result).toBeNull();
  });

  it("accepts a payment made after the plan last changed", async () => {
    list.mockResolvedValue({ items: [paid("2026-10-05T10:05:00.000Z")] });
    const result = await findRecentPaidUpgradePayment(
      "sub_1",
      new Date("2026-10-05T10:00:00.000Z"),
    );
    expect(result?.payment_id).toBe("pay_1");
  });

  it("allows a small clock difference", async () => {
    list.mockResolvedValue({ items: [paid("2026-10-05T09:59:30.000Z")] });
    const result = await findRecentPaidUpgradePayment(
      "sub_1",
      new Date("2026-10-05T10:00:00.000Z"),
    );
    expect(result).not.toBeNull();
  });

  it("skips the check when the change time is unknown", async () => {
    list.mockResolvedValue({ items: [paid("2020-01-01T00:00:00.000Z")] });
    expect(await findRecentPaidUpgradePayment("sub_1", null)).not.toBeNull();
  });
});

describe("isUniqueViolation", () => {
  it("matches the code directly or under cause, and by index name", () => {
    const direct = { code: "23505", constraint: "a_idx" };
    expect(isUniqueViolation(direct)).toBe(true);
    expect(isUniqueViolation(direct, "a_idx")).toBe(true);
    expect(isUniqueViolation(direct, "b_idx")).toBe(false);
    expect(isUniqueViolation({ cause: direct }, "a_idx")).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
  });
});
