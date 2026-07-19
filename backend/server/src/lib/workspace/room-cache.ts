import { redis } from "../redis.js";
import { withRedisTimeout } from "../redis-safe.js";
import type { TeamMemberDto } from "./team-service.js";

/** Shared TTL for team/workspace “room” details. */
const ROOM_CACHE_TTL_SEC = 5 * 60;

export type CachedTeamMeta = {
  id: string;
  name: string;
  ownerUserId: string;
  defaultWorkspaceId: string | null;
  isCollaborative: boolean;
};

export type CachedWorkspaceMeta = {
  id: string;
  name: string;
  teamId: string;
};

/** Workspace list entry without actor-specific `isActive`. */
export type CachedTeamWorkspace = {
  id: string;
  name: string;
  connectionCount: number;
};

function teamMetaKey(teamId: string) {
  return `team:meta:${teamId}`;
}

function teamMembersKey(teamId: string) {
  return `team:members:${teamId}`;
}

function teamWorkspacesKey(teamId: string) {
  return `team:workspaces:${teamId}`;
}

function workspaceMetaKey(workspaceId: string) {
  return `workspace:meta:${workspaceId}`;
}

async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  return withRedisTimeout(
    `get ${key}`,
    async () => {
      const raw = await redis!.get<T | string>(key);
      if (raw == null) return null;
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return null;
        }
      }
      return raw;
    },
    null,
  );
}

async function cacheSet(key: string, value: unknown): Promise<void> {
  if (!redis) return;
  await withRedisTimeout(
    `set ${key}`,
    async () => {
      await redis!.set(key, JSON.stringify(value), { ex: ROOM_CACHE_TTL_SEC });
    },
    undefined,
  );
}

async function cacheDel(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  await withRedisTimeout(
    `del ${keys.join(",")}`,
    async () => {
      await redis!.del(...keys);
    },
    undefined,
  );
}

export async function getCachedTeamMeta(
  teamId: string,
): Promise<CachedTeamMeta | null> {
  return cacheGet<CachedTeamMeta>(teamMetaKey(teamId));
}

export async function setCachedTeamMeta(meta: CachedTeamMeta): Promise<void> {
  await cacheSet(teamMetaKey(meta.id), meta);
}

export async function getCachedTeamMembers(
  teamId: string,
): Promise<TeamMemberDto[] | null> {
  return cacheGet<TeamMemberDto[]>(teamMembersKey(teamId));
}

export async function setCachedTeamMembers(
  teamId: string,
  members: TeamMemberDto[],
): Promise<void> {
  await cacheSet(teamMembersKey(teamId), members);
}

export async function getCachedTeamWorkspaces(
  teamId: string,
): Promise<CachedTeamWorkspace[] | null> {
  return cacheGet<CachedTeamWorkspace[]>(teamWorkspacesKey(teamId));
}

export async function setCachedTeamWorkspaces(
  teamId: string,
  workspaces: CachedTeamWorkspace[],
): Promise<void> {
  await cacheSet(teamWorkspacesKey(teamId), workspaces);
}

export async function getCachedWorkspaceMeta(
  workspaceId: string,
): Promise<CachedWorkspaceMeta | null> {
  return cacheGet<CachedWorkspaceMeta>(workspaceMetaKey(workspaceId));
}

export async function setCachedWorkspaceMeta(
  meta: CachedWorkspaceMeta,
): Promise<void> {
  await cacheSet(workspaceMetaKey(meta.id), meta);
}

/** Drop all cached room data for a team (and optional workspace ids). */
export async function invalidateTeamRoomCache(
  teamId: string,
  workspaceIds: string[] = [],
): Promise<void> {
  await cacheDel(
    teamMetaKey(teamId),
    teamMembersKey(teamId),
    teamWorkspacesKey(teamId),
    ...workspaceIds.map(workspaceMetaKey),
  );
}

export async function invalidateWorkspaceRoomCache(
  workspaceId: string,
  teamId?: string | null,
): Promise<void> {
  const keys = [workspaceMetaKey(workspaceId)];
  if (teamId) {
    keys.push(teamWorkspacesKey(teamId), teamMetaKey(teamId));
  }
  await cacheDel(...keys);
}

/** Members changed — keep team/workspace meta, refresh members on next read. */
export async function invalidateTeamMembersCache(teamId: string): Promise<void> {
  await cacheDel(teamMembersKey(teamId));
}

/** Workspace list / connection counts changed. */
export async function invalidateTeamWorkspacesCache(
  teamId: string,
): Promise<void> {
  await cacheDel(teamWorkspacesKey(teamId));
}
