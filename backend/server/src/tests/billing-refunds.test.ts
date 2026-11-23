import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A subscription cancelled as a duplicate (two paid checkouts) used to keep
 * the charge it took: cancelling stops renewals, nothing refunded.
 */

const mocks = vi.hoisted(() => ({
  latest: vi.fn(),
  retrievePayment: vi.fn(),
  createRefund: vi.fn(),
}));

vi.mock("../lib/env.js", () => ({
  env: {
    DODO_PAYMENTS_API_KEY: "dodo_test",
    DODO_PAYMENTS_ENVIRONMENT: "test_mode",
  },
}));
vi.mock("dodopayments", () => ({
  default: class {
    payments = { retrieve: mocks.retrievePayment };
    refunds = { create: mocks.createRefund };
  },
}));
vi.mock("../lib/billing-guards.js", () => ({
  getLatestSubscriptionPayment: mocks.latest,
}));

import { refundLatestSubscriptionCharge } from "../lib/billing-refunds.js";

describe("refundLatestSubscriptionCharge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.latest.mockResolvedValue({
      payment_id: "pay_1",
      status: "succeeded",
      total_amount: 900,
    });
    mocks.retrievePayment.mockResolvedValue({ refunds: [], refund_status: null });
    mocks.createRefund.mockResolvedValue({ refund_id: "ref_1" });
  });

  it("refunds the duplicate subscription's succeeded charge once", async () => {
    const res = await refundLatestSubscriptionCharge("sub_dup", "duplicate");
    expect(res).toEqual({ refunded: true, paymentId: "pay_1", refundId: "ref_1" });
    expect(mocks.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ payment_id: "pay_1", reason: "duplicate" }),
      { idempotencyKey: "duplicate-subscription-refund:pay_1" },
    );
  });

  it("skips a payment that already has a refund", async () => {
    mocks.retrievePayment.mockResolvedValue({
      refunds: [{ refund_id: "ref_0", status: "pending" }],
      refund_status: null,
    });
    const res = await refundLatestSubscriptionCharge("sub_dup", "duplicate");
    expect(res).toMatchObject({ refunded: false, reason: "already_refunded" });
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });

  it("retries when an earlier refund attempt failed", async () => {
    mocks.retrievePayment.mockResolvedValue({
      refunds: [{ refund_id: "ref_0", status: "failed" }],
      refund_status: null,
    });
    const res = await refundLatestSubscriptionCharge("sub_dup", "duplicate");
    expect(res.refunded).toBe(true);
  });

  it("skips an unpaid or zero-amount latest payment", async () => {
    mocks.latest.mockResolvedValueOnce({ payment_id: "pay_1", status: "failed", total_amount: 900 });
    expect(await refundLatestSubscriptionCharge("sub_dup", "d")).toMatchObject({
      refunded: false,
      reason: "not_paid",
    });
    mocks.latest.mockResolvedValueOnce({ payment_id: "pay_1", status: "succeeded", total_amount: 0 });
    expect(await refundLatestSubscriptionCharge("sub_dup", "d")).toMatchObject({
      refunded: false,
      reason: "not_paid",
    });
    mocks.latest.mockResolvedValueOnce(null);
    expect(await refundLatestSubscriptionCharge("sub_dup", "d")).toMatchObject({
      refunded: false,
      reason: "no_payment",
    });
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });

  it("reports a Dodo error instead of throwing", async () => {
    mocks.createRefund.mockRejectedValue(new Error("dodo 500"));
    const res = await refundLatestSubscriptionCharge("sub_dup", "duplicate");
    expect(res).toEqual({
      refunded: false,
      reason: "failed",
      paymentId: "pay_1",
      message: "dodo 500",
    });
  });
});
