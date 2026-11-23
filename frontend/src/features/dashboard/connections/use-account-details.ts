import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

/**
 * Extra per-account data the connections RPC doesn't return.
 * Query keys live under ["connections", …] so a workspace switch
 * invalidates them with the rest of the page.
 */

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error || fallback;
}

/** `platformMetadata` per account id (Pinterest default board etc.) from GET /api/accounts. */
export const ACCOUNT_METADATA_QUERY_KEY = ["connections", "account-metadata"] as const;

export function useAccountMetadata(enabled: boolean) {
  return useQuery({
    queryKey: ACCOUNT_METADATA_QUERY_KEY,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, Record<string, unknown>>> => {
      const res = await fetchApi("/api/accounts");
      if (!res.ok) throw new Error(await readError(res, "Couldn't load account details."));
      const rows = (await res.json()) as Array<{
        id: string;
        platformMetadata?: Record<string, unknown> | null;
      }>;
      const out: Record<string, Record<string, unknown>> = {};
      for (const r of Array.isArray(rows) ? rows : []) {
        out[r.id] = r.platformMetadata ?? {};
      }
      return out;
    },
  });
}

/** Number of publications made through Social0 on one account (GET /api/accounts/:id). */
export function useAccountPublicationCount(accountId: string | null) {
  return useQuery({
    queryKey: ["connections", "account-detail", accountId],
    enabled: !!accountId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const res = await fetchApi(`/api/accounts/${encodeURIComponent(accountId!)}`);
      if (!res.ok) throw new Error(await readError(res, "Couldn't load this account."));
      const body = (await res.json()) as { publicationCount?: number };
      return Number(body.publicationCount ?? 0);
    },
  });
}

export type PinterestBoard = { id: string; name: string };

/** Boards on a Pinterest account (live Pinterest call, so only fetched when the drawer asks). */
export function usePinterestBoards(accountId: string | null) {
  return useQuery({
    queryKey: ["connections", "pinterest-boards", accountId],
    enabled: !!accountId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<PinterestBoard[]> => {
      const res = await fetchApi(
        `/api/pinterest/boards?accountId=${encodeURIComponent(accountId!)}`,
      );
      if (!res.ok) throw new Error(await readError(res, "Couldn't load your Pinterest boards."));
      const body = (await res.json()) as { boards?: PinterestBoard[] };
      return body.boards ?? [];
    },
  });
}

export async function savePinterestDefaultBoard(
  accountId: string,
  boardId: string,
): Promise<void> {
  const res = await fetchApi("/api/pinterest/default-board", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, boardId }),
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't save the default board."));
}

export async function createPinterestBoard(input: {
  accountId: string;
  name: string;
  privacy: "PUBLIC" | "PRIVATE";
}): Promise<PinterestBoard> {
  const res = await fetchApi("/api/pinterest/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't create the board."));
  const body = (await res.json()) as { board?: PinterestBoard };
  if (!body.board?.id) throw new Error("Board created, but Pinterest didn't return it. Reload to see it.");
  return body.board;
}

/** Re-checks X Premium for every X account in the workspace (sets the 280 vs 25,000 character limit). */
export async function refreshXPremium(): Promise<void> {
  const res = await fetchApi("/api/connect/refresh-twitter-premium", { method: "POST" });
  if (!res.ok) throw new Error(await readError(res, "Couldn't recheck X Premium."));
}

export async function disconnectAccount(accountId: string): Promise<void> {
  const res = await fetchApi(`/api/accounts/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't disconnect this account."));
}

export async function connectBluesky(input: {
  handle: string;
  appPassword: string;
}): Promise<string> {
  const res = await fetchApi("/api/connect/bluesky/byok", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as {
    username?: string;
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.message || body.error || "Couldn't connect Bluesky.");
  }
  return body.username || input.handle;
}
