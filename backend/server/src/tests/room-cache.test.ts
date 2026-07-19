import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock("../lib/redis.js", () => ({
  redis: mockRedis,
}));

vi.mock("../lib/redis-safe.js", () => ({
  withRedisTimeout: async <T>(_label: string, fn: () => Promise<T>) => fn(),
}));

import {
  getCachedTeamMeta,
  invalidateTeamRoomCache,
  setCachedTeamMeta,
  setCachedWorkspaceMeta,
  invalidateWorkspaceRoomCache,
} from "../lib/workspace/room-cache.js";

describe("room-cache", () => {
  beforeEach(() => {
    mockRedis.get.mockReset();
    mockRedis.set.mockReset();
    mockRedis.del.mockReset();
  });

  it("stores and reads team meta", async () => {
    const meta = {
      id: "team-1",
      name: "Acme",
      ownerUserId: "owner-1",
      defaultWorkspaceId: "ws-1",
      isCollaborative: true,
    };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(meta));

    const cached = await getCachedTeamMeta("team-1");
    expect(cached).toEqual(meta);
    expect(mockRedis.get).toHaveBeenCalledWith("team:meta:team-1");

    await setCachedTeamMeta({ ...meta, name: "Acme Renamed" });
    expect(mockRedis.set).toHaveBeenCalledWith(
      "team:meta:team-1",
      JSON.stringify({ ...meta, name: "Acme Renamed" }),
      { ex: 300 },
    );
  });

  it("invalidates team room keys including workspaces", async () => {
    await invalidateTeamRoomCache("team-1", ["ws-1", "ws-2"]);
    expect(mockRedis.del).toHaveBeenCalledWith(
      "team:meta:team-1",
      "team:members:team-1",
      "team:workspaces:team-1",
      "workspace:meta:ws-1",
      "workspace:meta:ws-2",
    );
  });

  it("updates workspace meta and invalidates team workspace list", async () => {
    await setCachedWorkspaceMeta({
      id: "ws-1",
      name: "Design",
      teamId: "team-1",
    });
    expect(mockRedis.set).toHaveBeenCalledWith(
      "workspace:meta:ws-1",
      JSON.stringify({ id: "ws-1", name: "Design", teamId: "team-1" }),
      { ex: 300 },
    );

    await invalidateWorkspaceRoomCache("ws-1", "team-1");
    expect(mockRedis.del).toHaveBeenCalledWith(
      "workspace:meta:ws-1",
      "team:workspaces:team-1",
      "team:meta:team-1",
    );
  });
});
