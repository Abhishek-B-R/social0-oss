/**
 * Bind inbox DM replies to conversations returned for the connected account.
 */

import { withPlatformReadCache } from "../platform-api-cache.js";
import {
  fetchAccountDms,
  type DmAccount,
} from "./fetch-dms.js";
import { reconnectScopesFromFetch } from "./types.js";

/** Wide window so verify matches threads the inbox list can show. */
const VERIFY_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

export function dmConversationInList(
  threads: Array<{ conversationId: string }>,
  conversationId: string,
): boolean {
  return findDmConversationInList(threads, conversationId) != null;
}

/** Resolve the inbox thread (and peer) for a conversation id. */
export function findDmConversationInList(
  threads: Array<{ conversationId: string; peerId?: string }>,
  conversationId: string,
): { peerId: string } | null {
  const thread = threads.find((t) => t.conversationId === conversationId);
  if (!thread) return null;
  return { peerId: thread.peerId ?? "" };
}

async function fetchDmsForVerify(
  account: DmAccount,
  fresh: boolean,
): Promise<Awaited<ReturnType<typeof fetchAccountDms>>> {
  const since = new Date(Date.now() - VERIFY_LOOKBACK_MS);
  const until = new Date();
  const cached = await withPlatformReadCache({
    platform: account.platform,
    accountId: account.id,
    kind: "inbox_dms",
    suffix: `verify:${account.id}`,
    fresh,
    fetch: () => fetchAccountDms(account, since, until),
  });
  return cached.data;
}

export async function verifyDmConversationOnAccount(
  account: DmAccount,
  conversationId: string,
): Promise<{ ok: true; peerId: string } | { ok: false; error: string }> {
  if (!conversationId.trim()) {
    return { ok: false, error: "Invalid conversation id." };
  }

  for (const fresh of [false, true] as const) {
    const result = await fetchDmsForVerify(account, fresh);
    const thread = findDmConversationInList(result.threads, conversationId);
    if (thread) {
      if (account.platform === "instagram" && !thread.peerId) {
        return {
          ok: false,
          error: "Could not resolve recipient for this conversation.",
        };
      }
      return { ok: true, peerId: thread.peerId };
    }
    const scopes = reconnectScopesFromFetch(result);
    if (scopes.length) {
      return {
        ok: false,
        error: "Reconnect this account to reply to DMs.",
      };
    }
    if (result.status === "unsupported") {
      return {
        ok: false,
        error: `DMs are not supported for ${account.platform} yet.`,
      };
    }
    if (result.status === "error" && !result.threads.length) {
      return {
        ok: false,
        error: result.error ?? "Could not verify this conversation.",
      };
    }
  }

  return {
    ok: false,
    error: "Conversation is not in this account inbox.",
  };
}
