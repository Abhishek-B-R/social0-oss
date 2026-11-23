/**
 * `revokeAccountGrant` must not revoke a grant another row still uses, and
 * that includes rows of other users. Team connections are stored under the
 * owner's id even when an admin did the OAuth with their own login, so the
 * admin's personal Main row and the owner's workspace row can share one
 * LinkedIn / Google grant. Disconnecting the workspace copy used to revoke it
 * because the check only looked at the owner's own rows.
 */

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  userId: string;
  platform: "linkedin" | "youtube";
  platformUserId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
};

const { state, mocks } = vi.hoisted(() => ({
  state: {
    rows: [] as Row[],
    target: null as Row | null,
    lastWhere: null as unknown,
  },
  mocks: { revoke: vi.fn() },
}));

vi.mock("../db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        // Mirrors the SQL filter: same platform, not this row, and either the
        // same owner or the same platform identity.
        where: async (where: unknown) => {
          state.lastWhere = where;
          const t = state.target!;
          return state.rows.filter(
            (r) =>
              r.platform === t.platform &&
              r.id !== t.id &&
              (r.userId === t.userId || r.platformUserId === t.platformUserId),
          );
        },
      }),
    }),
  },
}));
vi.mock("@social0/shared", () => ({
  // Test "ciphertext" is the token itself.
  decryptToken: (value: string) => value,
}));
vi.mock("../lib/revoke-token.js", () => ({
  revokeTokenOnPlatform: mocks.revoke,
}));

import { revokeAccountGrant } from "../lib/revoke-account-grant.js";

function row(partial: Partial<Row> & Pick<Row, "id" | "userId">): Row {
  return {
    platform: "youtube",
    platformUserId: "UC_channel",
    encryptedAccessToken: `access_${partial.id}`,
    encryptedRefreshToken: `refresh_${partial.id}`,
    ...partial,
  };
}

async function disconnect(target: Row, removingWith?: ReadonlySet<string>) {
  state.target = target;
  await revokeAccountGrant(target, removingWith ? { removingWith } : undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  state.target = null;
  state.lastWhere = null;
});

describe("revokeAccountGrant across users", () => {
  it("keeps a YouTube grant another user's row still uses", async () => {
    // Admin A's personal Main, and the same channel in owner O's workspace.
    const personal = row({ id: "a_main", userId: "admin_a" });
    const teamCopy = row({ id: "o_w1", userId: "owner_o" });
    state.rows = [personal, teamCopy];

    await disconnect(teamCopy);

    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("keeps a LinkedIn grant another user's row still uses", async () => {
    const personal = row({
      id: "a_main",
      userId: "admin_a",
      platform: "linkedin",
      platformUserId: "member_a",
    });
    const teamCopy = row({
      id: "o_w1",
      userId: "owner_o",
      platform: "linkedin",
      platformUserId: "member_a",
    });
    state.rows = [personal, teamCopy];

    await disconnect(teamCopy);

    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("queries other users' rows by platform identity, not only the owner's", async () => {
    const target = row({ id: "o_w1", userId: "owner_o" });
    state.rows = [target];

    await disconnect(target);

    const { sql, params } = new PgDialect().sqlToQuery(state.lastWhere as SQL);
    expect(sql).toContain('"platform_user_id"');
    expect(sql).toMatch(/ or /i);
    expect(params).toEqual(
      expect.arrayContaining(["owner_o", "UC_channel", "o_w1", "youtube"]),
    );
  });

  it("revokes when no other row holds the grant", async () => {
    const target = row({ id: "o_w1", userId: "owner_o" });
    state.rows = [target];

    await disconnect(target);

    expect(mocks.revoke).toHaveBeenCalledWith("youtube", "access_o_w1");
  });

  it("still revokes when another user only has a different LinkedIn identity", async () => {
    const target = row({
      id: "o_w1",
      userId: "owner_o",
      platform: "linkedin",
      platformUserId: "member_b",
    });
    state.rows = [
      target,
      row({
        id: "a_main",
        userId: "admin_a",
        platform: "linkedin",
        platformUserId: "member_a",
      }),
    ];

    await disconnect(target);

    expect(mocks.revoke).toHaveBeenCalledWith("linkedin", "access_o_w1");
  });

  it("keeps the owner-wide LinkedIn heuristic for the owner's own rows", async () => {
    const page = row({
      id: "o_page",
      userId: "owner_o",
      platform: "linkedin",
      platformUserId: "urn:li:organization:1",
    });
    state.rows = [
      page,
      row({
        id: "o_profile",
        userId: "owner_o",
        platform: "linkedin",
        platformUserId: "member_o",
      }),
    ];

    await disconnect(page);

    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("ignores rows deleted in the same operation, but not a teammate's", async () => {
    // Account deletion: both of the owner's rows go, A's personal row stays.
    const ownerYt = row({ id: "o_yt", userId: "owner_o" });
    const ownerLi = row({
      id: "o_li",
      userId: "owner_o",
      platform: "linkedin",
      platformUserId: "member_o",
    });
    const ownerLiPage = row({
      id: "o_li_page",
      userId: "owner_o",
      platform: "linkedin",
      platformUserId: "urn:li:organization:1",
    });
    const adminYt = row({ id: "a_main", userId: "admin_a" });
    state.rows = [ownerYt, ownerLi, ownerLiPage, adminYt];
    const removing = new Set(["o_yt", "o_li", "o_li_page"]);

    await disconnect(ownerYt, removing);
    await disconnect(ownerLi, removing);
    await disconnect(ownerLiPage, removing);

    expect(mocks.revoke.mock.calls).toEqual([
      ["linkedin", "access_o_li"],
      ["linkedin", "access_o_li_page"],
    ]);
  });
});
