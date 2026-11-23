import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * claimSubscriptionForUser is the only way billing sync writes a subscription
 * id. Its SQL must (a) compare-and-set against the id the caller read and (b)
 * refuse an id that another user_settings row already holds, so one payment
 * can never back two accounts. Runs drizzle's real query builder against a
 * fake pg client and checks the statements it sends.
 */

const { sent, nextRows } = vi.hoisted(() => ({
  sent: [] as Array<{ text: string; values: unknown[] }>,
  nextRows: { update: [] as unknown[][] },
}));

vi.mock("../db/index.js", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("../db/schema.js");
  const client = {
    query: async (
      q: { text: string; values?: unknown[] } | string,
      values?: unknown[],
    ) => {
      const text = typeof q === "string" ? q : q.text;
      const vals = values ?? (typeof q === "string" ? [] : (q.values ?? []));
      sent.push({ text, values: vals });
      const rows = text.startsWith("update") ? nextRows.update : [];
      return { rows, rowCount: rows.length, fields: [], command: "" };
    },
  };
  return { db: drizzle(client as never, { schema }) };
});

import { claimSubscriptionForUser, subscriptionOwnership } from "../lib/billing-ownership.js";

describe("claimSubscriptionForUser", () => {
  beforeEach(() => {
    sent.length = 0;
    nextRows.update = [];
  });

  it("ensures the row, then compare-and-sets with an exclusivity guard", async () => {
    nextRows.update = [["user_B"]];
    const ok = await claimSubscriptionForUser("user_B", "sub_1", null);

    expect(ok).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[0].text).toMatch(/^insert into "user_settings"/);
    expect(sent[0].text).toMatch(/on conflict do nothing/);

    const update = sent[1];
    expect(update.text).toMatch(/^update "user_settings" set "subscription_id" = \$1/);
    expect(update.text).toMatch(/"user_settings"\."subscription_id" is null/);
    expect(update.text).toMatch(
      /not exists \(select 1 from "user_settings" as other where other\."user_id" <> \$\d+ and other\."subscription_id" = \$\d+\)/,
    );
    expect(update.text).not.toMatch(/customer_id/);
    expect(update.values).toEqual(
      expect.arrayContaining(["sub_1", "user_B"]),
    );
  });

  it("returns false when the guarded update matches no row", async () => {
    nextRows.update = [];
    expect(await claimSubscriptionForUser("user_B", "sub_1", "sub_0")).toBe(false);
    expect(sent[1].values).toEqual(expect.arrayContaining(["sub_0"]));
  });

  it("also guards the Dodo customer for email-only bindings", async () => {
    await claimSubscriptionForUser("user_B", "sub_1", null, {
      exclusiveCustomerId: "cus_A",
    });
    expect(sent[1].text).toMatch(/other\."customer_id" = \$\d+/);
    expect(sent[1].values).toEqual(expect.arrayContaining(["cus_A"]));
  });
});

describe("subscriptionOwnership", () => {
  it("trusts checkout metadata over the email", () => {
    expect(
      subscriptionOwnership(
        { metadata: { userId: "user_A" }, customerEmail: "e1@x.com" },
        "user_B",
        "e1@x.com",
      ),
    ).toBeNull();
    expect(
      subscriptionOwnership(
        { metadata: { userId: "user_A" }, customerEmail: "old@x.com" },
        "user_A",
        "new@x.com",
      ),
    ).toBe("metadata");
  });

  it("falls back to the email only without metadata", () => {
    expect(
      subscriptionOwnership({ metadata: {}, customerEmail: " E1@x.com " }, "user_B", "e1@x.com"),
    ).toBe("email");
    expect(
      subscriptionOwnership({ metadata: null, customerEmail: "" }, "user_B", ""),
    ).toBeNull();
  });
});
