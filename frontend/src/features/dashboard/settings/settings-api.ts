import { fetchApi } from "@/lib/fetch-api";
import type { TeamPermissions, WorkspaceRole } from "@/api/team";

/**
 * Small REST wrappers used only by Settings. They call endpoints that already
 * exist (`/api/team/context`, `/api/queue/slots*`); nothing new on the server.
 */

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

/** The server's *active* workspace and the caller's permissions in it. */
export type WorkspaceContext = {
  role: WorkspaceRole | null;
  /** null = personal Main (full access). */
  permissions: TeamPermissions | null;
  resourceOwnerId: string;
  /**
   * The resource owner's timezone (UTC when unset or invalid). Queue slots run
   * in this zone, which differs from the viewer's own in a team they don't own.
   * Optional so an older API without the field still renders.
   */
  resourceOwnerTimezone?: string;
  teamsEnabled: boolean;
  workspaceId: string | null;
  teamId: string | null;
  isOwner: boolean;
};

export const WORKSPACE_CONTEXT_QUERY_KEY = ["team", "context"] as const;

export async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const res = await fetchApi("/api/team/context");
  if (!res.ok) throw new Error(await errorFrom(res, "Couldn't load your workspace."));
  return res.json() as Promise<WorkspaceContext>;
}

export type QueueSlot = {
  id: string;
  userId: string;
  daysOfWeek: number[];
  hour: number;
  minute: number;
  isActive: boolean;
  createdAt?: string;
};

export const QUEUE_SLOTS_QUERY_KEY = ["queue-slots"] as const;

export async function listQueueSlots(): Promise<QueueSlot[]> {
  const res = await fetchApi("/api/queue/slots");
  if (!res.ok) throw new Error(await errorFrom(res, "Couldn't load your posting times."));
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as QueueSlot[]) : [];
}

export async function createQueueSlot(input: {
  daysOfWeek: number[];
  hour: number;
  minute: number;
}): Promise<QueueSlot> {
  const res = await fetchApi("/api/queue/slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorFrom(res, "Couldn't add that time."));
  return res.json() as Promise<QueueSlot>;
}

export async function updateQueueSlot(
  id: string,
  patch: Partial<Pick<QueueSlot, "daysOfWeek" | "hour" | "minute">>,
): Promise<QueueSlot> {
  const res = await fetchApi(`/api/queue/slots/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await errorFrom(res, "Couldn't update that time."));
  return res.json() as Promise<QueueSlot>;
}

export async function deleteQueueSlot(id: string): Promise<void> {
  const res = await fetchApi(`/api/queue/slots/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorFrom(res, "Couldn't remove that time."));
}
