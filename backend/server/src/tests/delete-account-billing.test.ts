/**
 * `settings.deleteAccount` must not leave a Dodo subscription billing.
 *
 * Once the account is deleted the user cannot reach the billing portal, so:
 * - every open sub for the email/customer is cancelled, not only the stored
 *   id (which is null while a sub is on_hold);
 * - a failed cancel or an unfinished list aborts the deletion before any
 *   session or row is touched;
 * - a stored id Dodo no longer knows does not block deletion.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks, state } = vi.hoisted(() => {
  class NotFoundError extends Error {
    status = 404;
  }
  return {
    state: {
      settings: null as null | {
        subscriptionId: string | null;
        customerId: string | null;
      },
      accounts: [] as Array<Record<string, unknown>>,
    },
    mocks: {
      NotFoundError,
      getSession: vi.fn(),
      revokeSessions: vi.fn(),
      signOut: vi.fn(),
      listOpenSubs: vi.fn(),
      forceCancel: vi.fn(),
      retrieve: vi.fn(),
      dbDelete: vi.fn(),
      dbUpdate: vi.fn(),
      revokeAccountGrant: vi.fn(),
    },
  };
});

vi.mock("@/db/schema", () => import("../db/schema.js"));
vi.mock("@/db", () => ({
  db: {
    query: {
      userSettings: { findFirst: vi.fn(async () => state.settings ?? undefined) },
      connectedAccounts: { findMany: vi.fn(async () => state.accounts) },
    },
    delete: (table: unknown) => ({
      where: async () => {
        mocks.dbDelete(table);
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          mocks.dbUpdate(table, values);
        },
      }),
    }),
  },
}));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      revokeSessions: mocks.revokeSessions,
      signOut: mocks.signOut,
    },
  },
}));
vi.mock("@/lib/require-session-user", () => ({
  requireSessionUserId: vi.fn(),
}));
vi.mock("../lib/http/request-cookies.js", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ delete: vi.fn() })),
}));
vi.mock("../lib/http/route-redirect.js", () => ({ redirect: vi.fn() }));
vi.mock("@social0/shared", () => ({
  decryptToken: vi.fn(() => "token"),
  isSafeOutboundUrl: vi.fn(() => true),
}));
vi.mock("../lib/resolve-scheduled-at.js", () => ({
  isValidIanaTimezone: () => true,
}));
vi.mock("../lib/revoke-account-grant.js", () => ({
  revokeAccountGrant: mocks.revokeAccountGrant,
}));
vi.mock("../lib/env.js", () => ({
  env: {
    DODO_PAYMENTS_API_KEY: "dodo_test",
    DODO_PAYMENTS_ENVIRONMENT: "test_mode",
  },
}));
vi.mock("dodopayments", () => ({
  default: class {
    static NotFoundError = mocks.NotFoundError;
    subscriptions = { retrieve: mocks.retrieve };
  },
}));
vi.mock("../lib/billing-guards.js", () => ({
  listOpenDodoSubscriptions: mocks.listOpenSubs,
}));
vi.mock("../lib/billing-zombie-utils.js", () => ({
  forceCancelDodoSubscription: mocks.forceCancel,
}));

import { deleteAccount } from "../services/settings.js";

const openSub = (subscriptionId: string, status = "active") => ({
  subscriptionId,
  status,
  productId: "prod_pro",
  customerId: "cus_1",
  previousBillingDate: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.settings = { subscriptionId: null, customerId: "cus_1" };
  state.accounts = [];
  mocks.getSession.mockResolvedValue({
    user: { id: "user_1", email: "a@example.com" },
  });
  mocks.listOpenSubs.mockResolvedValue([]);
  mocks.forceCancel.mockResolvedValue({ ok: true });
  mocks.retrieve.mockResolvedValue({ status: "active" });
});

describe("deleteAccount billing", () => {
  it("cancels an on_hold sub whose id is no longer stored locally", async () => {
    mocks.listOpenSubs.mockImplementation(
      async (_email: string, customerId: string | null) =>
        customerId ? [openSub("sub_hold", "on_hold")] : [],
    );

    const result = await deleteAccount("DELETE");

    expect(result).toEqual({ success: true });
    expect(mocks.forceCancel).toHaveBeenCalledWith("sub_hold");
    // Strict listing, by email and by stored customer.
    expect(mocks.listOpenSubs).toHaveBeenCalledWith("a@example.com", null, {
      throwOnError: true,
    });
    expect(mocks.listOpenSubs).toHaveBeenCalledWith("a@example.com", "cus_1", {
      throwOnError: true,
    });
    expect(mocks.dbDelete).toHaveBeenCalled();
  });

  it("cancels every open sub plus the stored one, each once", async () => {
    state.settings = { subscriptionId: "sub_stored", customerId: "cus_1" };
    mocks.listOpenSubs.mockResolvedValue([openSub("sub_a"), openSub("sub_b")]);

    const result = await deleteAccount("DELETE");

    expect(result).toEqual({ success: true });
    expect(mocks.forceCancel.mock.calls.map((c) => c[0]).sort()).toEqual([
      "sub_a",
      "sub_b",
      "sub_stored",
    ]);
  });

  it("aborts before touching sessions or rows when a cancel fails", async () => {
    mocks.listOpenSubs.mockResolvedValue([openSub("sub_hold", "on_hold")]);
    mocks.forceCancel.mockResolvedValue({ ok: false, message: "429" });

    const result = await deleteAccount("DELETE");

    expect(result.success).toBe(false);
    expect(mocks.revokeSessions).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it("aborts when the open-subscription list cannot be completed", async () => {
    mocks.listOpenSubs.mockRejectedValue(new Error("Dodo 503"));

    const result = await deleteAccount("DELETE");

    expect(result.success).toBe(false);
    expect(mocks.forceCancel).not.toHaveBeenCalled();
    expect(mocks.revokeSessions).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("does not let a stored id Dodo no longer knows block deletion", async () => {
    state.settings = { subscriptionId: "sub_gone", customerId: null };
    mocks.retrieve.mockRejectedValue(new mocks.NotFoundError("not found"));

    const result = await deleteAccount("DELETE");

    expect(result).toEqual({ success: true });
    expect(mocks.forceCancel).not.toHaveBeenCalled();
    expect(mocks.dbDelete).toHaveBeenCalled();
  });

  it("aborts when the stored id cannot be checked for another reason", async () => {
    state.settings = { subscriptionId: "sub_stored", customerId: null };
    mocks.retrieve.mockRejectedValue(new Error("Dodo 500"));

    const result = await deleteAccount("DELETE");

    expect(result.success).toBe(false);
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });
});

describe("deleteAccount platform revokes", () => {
  it("routes every row through the shared-grant check, ignoring rows deleted with it", async () => {
    // A teammate's personal row can share a grant with one of these (team
    // rows are stored under the owner's id), so a raw revoke per row would
    // break the teammate's connection.
    state.accounts = [
      { id: "acc_li", userId: "user_1", platform: "linkedin" },
      { id: "acc_yt", userId: "user_1", platform: "youtube" },
    ];

    const result = await deleteAccount("DELETE");

    expect(result).toEqual({ success: true });
    expect(mocks.revokeAccountGrant).toHaveBeenCalledTimes(2);
    for (const [row, options] of mocks.revokeAccountGrant.mock.calls) {
      expect(state.accounts).toContain(row);
      expect([...options.removingWith].sort()).toEqual(["acc_li", "acc_yt"]);
    }
  });
});
