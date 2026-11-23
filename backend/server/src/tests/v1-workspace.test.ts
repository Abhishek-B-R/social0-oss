/**
 * Opt-in `workspace_id` on `/v1`: without it a key stays on the personal
 * pool; with it, the caller's role in that workspace decides.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { workspaceContextFor } = vi.hoisted(() => ({ workspaceContextFor: vi.fn() }));
vi.mock("../lib/workspace/context.js", async (orig) => ({
  ...(await orig<typeof import("../lib/workspace/context.js")>()),
  workspaceContextFor,
}));

import { permissionsForRole } from "../lib/workspace/permissions.js";
import { V1_ROUTE_SCOPES } from "../lib/v1-scopes.js";
import { resolveV1Workspace, V1_ROUTE_PERMISSIONS } from "../lib/v1-workspace.js";

const WS = "77777777-7777-4777-8777-777777777777";

function call(method: string, url: string, query: Record<string, unknown> = {}) {
  const request = { method, routeOptions: { url }, query } as never as Parameters<typeof resolveV1Workspace>[0] & {
    v1Workspace?: { workspaceId: string | null; resourceUserId: string };
  };
  const sent: { status?: number; body?: { error?: { code?: string } } } = {};
  const reply = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: never) {
      sent.body = body;
      return this;
    },
  } as never;
  return { request, reply, sent };
}

function ctx(role: "admin" | "member" | "community" | "analyst", teamsEnabled = true) {
  return {
    actorUserId: "user-1",
    resourceUserId: "owner-1",
    workspaceId: WS,
    role,
    isOwner: false,
    teamsEnabled,
    permissions: permissionsForRole(role, { isOwner: false, teamsEnabled, inWorkspace: true }),
  };
}

beforeEach(() => workspaceContextFor.mockReset());

describe("V1_ROUTE_PERMISSIONS", () => {
  it("covers exactly the routes V1_ROUTE_SCOPES does", () => {
    expect(Object.keys(V1_ROUTE_PERMISSIONS).sort()).toEqual(Object.keys(V1_ROUTE_SCOPES).sort());
  });
});

describe("resolveV1Workspace", () => {
  it("keeps the personal pool without workspace_id", async () => {
    const { request, reply } = call("GET", "/v1/posts");
    expect(await resolveV1Workspace(request, reply, "user-1")).toBe(true);
    expect(request.v1Workspace).toMatchObject({ workspaceId: null, resourceUserId: "user-1" });
    expect(workspaceContextFor).not.toHaveBeenCalled();
  });

  it("acts as the workspace owner when the role allows it", async () => {
    workspaceContextFor.mockResolvedValue(ctx("member"));
    const { request, reply } = call("POST", "/v1/posts/publish", { workspace_id: WS });
    expect(await resolveV1Workspace(request, reply, "user-1")).toBe(true);
    expect(request.v1Workspace).toMatchObject({ workspaceId: WS, resourceUserId: "owner-1" });
  });

  it("refuses what the role can't do", async () => {
    workspaceContextFor.mockResolvedValue(ctx("analyst"));
    const { request, reply, sent } = call("POST", "/v1/posts/publish", { workspace_id: WS });
    expect(await resolveV1Workspace(request, reply, "user-1")).toBe(false);
    expect(sent.status).toBe(403);
  });

  it("refuses a teammate while the owner's plan has lapsed", async () => {
    workspaceContextFor.mockResolvedValue(ctx("admin", false));
    const { request, reply, sent } = call("GET", "/v1/posts", { workspace_id: WS });
    expect(await resolveV1Workspace(request, reply, "user-1")).toBe(false);
    expect(sent.status).toBe(403);
  });

  it("answers 404 for a workspace the caller isn't in", async () => {
    workspaceContextFor.mockResolvedValue(null);
    const { request, reply, sent } = call("GET", "/v1/posts", { workspace_id: WS });
    expect(await resolveV1Workspace(request, reply, "user-1")).toBe(false);
    expect(sent.status).toBe(404);
  });

  it("refuses workspace_id on account-level routes and malformed ids", async () => {
    for (const [method, url, id] of [
      ["GET", "/v1/webhooks", WS],
      ["GET", "/v1/posts", "not-a-uuid"],
    ] as const) {
      const { request, reply, sent } = call(method, url, { workspace_id: id });
      expect(await resolveV1Workspace(request, reply, "user-1")).toBe(false);
      expect(sent.status).toBe(400);
    }
    expect(workspaceContextFor).not.toHaveBeenCalled();
  });
});
