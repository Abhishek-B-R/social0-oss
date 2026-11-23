/**
 * Regressions for deleting a team / workspace while keeping its connections.
 *
 * - The same account connected in two workspaces of one team used to land in
 *   one `UPDATE … SET workspace_id = NULL`, which breaks the personal unique
 *   index (23505) after duplicates had already been hard-deleted outside any
 *   transaction, so every retry failed the same way.
 * - Duplicates were deleted outright, which SET NULLs their publications and
 *   cascades their Auto-Plugs, cutting the "kept" posts off that account.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const h = vi.hoisted(() => ({
  mockDb: {
    query: { teams: { findFirst: vi.fn() } },
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  invalidateTeamRoomCache: vi.fn(),
}));

vi.mock("../db/index.js", () => ({ db: h.mockDb }));
vi.mock("../lib/subscription.js", () => ({ getSubscriptionForUser: vi.fn() }));
vi.mock("../lib/workspace/context.js", () => ({
  resolveWorkspaceContext: vi.fn(),
  ensureOwnerTeam: vi.fn(),
  setActiveWorkspace: vi.fn(),
  defaultWorkspaceNameForTeam: vi.fn(),
}));
vi.mock("../lib/workspace/emails.js", () => ({
  sendWorkspaceInviteEmail: vi.fn(),
  sendWorkspaceInviteAcceptedEmail: vi.fn(),
  sendWorkspaceMemberRemovedEmail: vi.fn(),
  sendWorkspaceRoleChangedEmail: vi.fn(),
}));
vi.mock("../lib/workspace/room-cache.js", () => ({
  getCachedTeamMembers: vi.fn().mockResolvedValue(null),
  getCachedTeamMeta: vi.fn().mockResolvedValue(null),
  getCachedTeamWorkspaces: vi.fn().mockResolvedValue(null),
  getCachedWorkspaceMeta: vi.fn().mockResolvedValue(null),
  setCachedTeamMembers: vi.fn(),
  setCachedTeamMeta: vi.fn(),
  setCachedTeamWorkspaces: vi.fn(),
  setCachedWorkspaceMeta: vi.fn(),
  invalidateTeamMembersCache: vi.fn(),
  invalidateTeamRoomCache: h.invalidateTeamRoomCache,
  invalidateTeamWorkspacesCache: vi.fn(),
}));

import {
  autoPlugs,
  connectedAccounts,
  postPublications,
  posts,
  teams,
  userSettings,
  workspaces,
} from "../db/schema.js";
import {
  deleteTeamForUser,
  deleteWorkspaceInTeam,
  planConnectionMerge,
} from "../lib/workspace/team-service.js";

const dialect = new PgDialect();
const render = (cond: SQL | undefined) =>
  cond ? dialect.sqlToQuery(cond) : { sql: "", params: [] as unknown[] };

const TABLE_NAMES = new Map<unknown, string>([
  [autoPlugs, "auto_plugs"],
  [connectedAccounts, "connected_accounts"],
  [postPublications, "post_publications"],
  [posts, "posts"],
  [teams, "teams"],
  [userSettings, "user_settings"],
  [workspaces, "workspaces"],
]);

type Op =
  | {
      kind: "update";
      table: string;
      values: Record<string, unknown>;
      where: { sql: string; params: unknown[] };
    }
  | { kind: "delete"; table: string; where: { sql: string; params: unknown[] } };

/** Chainable fake executor: records writes, answers selects from a queue. */
function fakeExecutor(selectResults: unknown[][], ops: Op[]) {
  const select = () => {
    const rows = selectResults.shift() ?? [];
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy", "limit", "innerJoin"]) {
      chain[m] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject);
    return chain;
  };
  const update = (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: async (cond: SQL) => {
        ops.push({
          kind: "update",
          table: TABLE_NAMES.get(table) ?? "?",
          values,
          where: render(cond),
        });
      },
    }),
  });
  const del = (table: unknown) => ({
    where: async (cond: SQL) => {
      ops.push({ kind: "delete", table: TABLE_NAMES.get(table) ?? "?", where: render(cond) });
    },
  });
  return { select: vi.fn(select), update: vi.fn(update), delete: vi.fn(del) };
}

let ops: Op[];
let txSelects: unknown[][];

function wireTransaction() {
  h.mockDb.transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(fakeExecutor(txSelects, ops)),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  txSelects = [];
  wireTransaction();
  h.mockDb.update.mockImplementation(() => {
    throw new Error("write outside the transaction");
  });
  h.mockDb.delete.mockImplementation(() => {
    throw new Error("write outside the transaction");
  });
});

describe("planConnectionMerge", () => {
  const key = (a: { k: string }) => a.k;

  it("folds an account repeated across source workspaces into its first row", () => {
    const plan = planConnectionMerge(
      [
        { id: "a", k: "u1:twitter_x:brand" },
        { id: "b", k: "u1:twitter_x:brand" },
        { id: "c", k: "u1:linkedin:me" },
      ],
      key,
      new Map(),
    );
    expect(plan.toMove).toEqual(["a", "c"]);
    expect(plan.duplicates).toEqual([{ dupId: "b", keepId: "a" }]);
  });

  it("keeps the destination's row when the account already exists there", () => {
    const plan = planConnectionMerge(
      [
        { id: "a", k: "u1:twitter_x:brand" },
        { id: "b", k: "u1:twitter_x:brand" },
      ],
      key,
      new Map([["u1:twitter_x:brand", "main"]]),
    );
    expect(plan.toMove).toEqual([]);
    expect(plan.duplicates).toEqual([
      { dupId: "a", keepId: "main" },
      { dupId: "b", keepId: "main" },
    ]);
  });
});

function primeTeam(wsIds: string[]) {
  h.mockDb.query.teams.findFirst.mockResolvedValue({
    id: "team-1",
    ownerUserId: "owner",
  });
  const rows = wsIds.map((id) => ({ id }));
  h.mockDb.select.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(rows) }),
  });
}

describe("deleteTeamForUser keepConnections", () => {
  it("moves one copy of an account connected in two workspaces and repoints the other", async () => {
    primeTeam(["ws-a", "ws-b"]);
    txSelects = [
      // source rows across the team's workspaces
      [
        { id: "acc-a", userId: "owner", platform: "twitter_x", platformUserId: "brand" },
        { id: "acc-b", userId: "owner", platform: "twitter_x", platformUserId: "brand" },
      ],
      // nothing on Main yet
      [],
    ];

    const result = await deleteTeamForUser("owner", "team-1", {
      keepConnections: true,
    });

    expect(result).toEqual({ moved: 1, skipped: 1 });
    expect(h.mockDb.transaction).toHaveBeenCalledOnce();

    const pubRepoint = ops.findIndex(
      (o) => o.kind === "update" && o.table === "post_publications",
    );
    const plugRepoint = ops.findIndex(
      (o) => o.kind === "update" && o.table === "auto_plugs",
    );
    const dupDelete = ops.findIndex(
      (o) => o.kind === "delete" && o.table === "connected_accounts",
    );
    const move = ops.findIndex(
      (o) =>
        o.kind === "update" &&
        o.table === "connected_accounts" &&
        o.values.workspaceId === null,
    );
    const teamDelete = ops.findIndex(
      (o) => o.kind === "delete" && o.table === "teams",
    );

    // References follow the duplicate onto the survivor before it is dropped.
    expect(ops[pubRepoint]).toMatchObject({
      values: { connectedAccountId: "acc-a" },
    });
    expect(ops[pubRepoint]!.where.params).toEqual(["acc-b", "acc-a"]);
    expect(ops[pubRepoint]!.where.sql).toContain("not exists");
    expect(ops[plugRepoint]).toMatchObject({
      values: { connectedAccountId: "acc-a" },
    });
    expect(ops[dupDelete]!.where.params).toEqual(["acc-b"]);
    expect(pubRepoint).toBeLessThan(dupDelete);
    expect(plugRepoint).toBeLessThan(dupDelete);

    // Only one row per account reaches Main, after its duplicate is gone.
    expect(ops[move]!.where.params).toEqual(["acc-a"]);
    expect(dupDelete).toBeLessThan(move);
    expect(move).toBeLessThan(teamDelete);
    expect(h.invalidateTeamRoomCache).toHaveBeenCalledWith("team-1", [
      "ws-a",
      "ws-b",
    ]);
  });

  it("repoints a duplicate of a Main account to the Main row", async () => {
    primeTeam(["ws-a"]);
    txSelects = [
      [{ id: "acc-a", userId: "owner", platform: "linkedin", platformUserId: "me" }],
      [{ id: "main-1", userId: "owner", platform: "linkedin", platformUserId: "me" }],
    ];

    const result = await deleteTeamForUser("owner", "team-1", {
      keepConnections: true,
    });

    expect(result).toEqual({ moved: 0, skipped: 1 });
    const repoint = ops.find(
      (o) => o.kind === "update" && o.table === "post_publications",
    );
    expect(repoint).toMatchObject({ values: { connectedAccountId: "main-1" } });
    expect(
      ops.some(
        (o) =>
          o.kind === "update" &&
          o.table === "connected_accounts" &&
          o.values.workspaceId === null,
      ),
    ).toBe(false);
  });

  it("leaves the cache alone and propagates when the transaction fails", async () => {
    primeTeam(["ws-a"]);
    h.mockDb.transaction.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key"), { code: "23505" }),
    );

    await expect(
      deleteTeamForUser("owner", "team-1", { keepConnections: true }),
    ).rejects.toThrow("duplicate key");
    expect(h.invalidateTeamRoomCache).not.toHaveBeenCalled();
  });
});

describe("deleteWorkspaceInTeam", () => {
  it("repoints a duplicate's publications to the default workspace's row before dropping it", async () => {
    let outerSelect = 0;
    h.mockDb.select.mockImplementation(() => {
      outerSelect += 1;
      if (outerSelect === 1) {
        const chain = {
          from: () => chain,
          innerJoin: () => chain,
          where: () => chain,
          limit: () =>
            Promise.resolve([
              {
                workspaceId: "ws-a",
                teamId: "team-1",
                ownerUserId: "owner",
                defaultWorkspaceId: "ws-default",
                isCollaborative: true,
              },
            ]),
        };
        return chain;
      }
      return {
        from: () => ({ where: () => Promise.resolve([{ count: 2 }]) }),
      };
    });
    txSelects = [
      [
        { id: "acc-a", platform: "twitter_x", platformUserId: "brand" },
        { id: "acc-a2", platform: "linkedin", platformUserId: "me" },
      ],
      [{ id: "acc-default", platform: "twitter_x", platformUserId: "brand" }],
    ];

    const result = await deleteWorkspaceInTeam("owner", "ws-a");

    expect(result).toEqual({ moved: 1, skipped: 1 });
    expect(h.mockDb.transaction).toHaveBeenCalledOnce();
    const repoint = ops.findIndex(
      (o) => o.kind === "update" && o.table === "post_publications",
    );
    const dupDelete = ops.findIndex(
      (o) => o.kind === "delete" && o.table === "connected_accounts",
    );
    expect(ops[repoint]).toMatchObject({
      values: { connectedAccountId: "acc-default" },
    });
    expect(ops[repoint]!.where.params).toEqual(["acc-a", "acc-default"]);
    expect(ops[dupDelete]!.where.params).toEqual(["acc-a"]);
    expect(repoint).toBeLessThan(dupDelete);

    const move = ops.find(
      (o) =>
        o.kind === "update" &&
        o.table === "connected_accounts" &&
        o.values.workspaceId === "ws-default",
    );
    expect(move?.where.params).toEqual(["acc-a2"]);
    const postsMove = ops.find((o) => o.kind === "update" && o.table === "posts");
    expect(postsMove).toMatchObject({ values: { workspaceId: "ws-default" } });
    expect(ops.at(-1)).toMatchObject({ kind: "delete", table: "workspaces" });
  });
});
