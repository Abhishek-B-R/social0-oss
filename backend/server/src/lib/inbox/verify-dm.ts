/**
 * Bind inbox DM replies to conversations returned for the connected account.
 */

import {
  PlatformApiCooldownError,
  withPlatformReadCache,
} from "../platform-api-cache.js";
import {
  fetchAccountDms,
  fetchDmMessages,
  type DmAccount,
} from "./fetch-dms.js";
import { dmListFetchPlan, dmThreadCacheSuffix } from "./page-param.js";
import { reconnectScopesFromFetch } from "./types.js";

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

/**
 * Peer proven by a successful thread read. The platform only returns a
 * conversation's messages to its participants, so a non-empty page fetched
 * with this account's token binds the conversation to the account, and the
 * thread's peer is the recipient. Returns null when the read cannot prove it.
 */
export function verifiedPeerFromThread(result: {
  status: string;
  messages: unknown[];
  thread?: { peerId?: string | null };
}): string | null {
  if (result.status !== "ok" || result.messages.length === 0) return null;
  const peerId = result.thread?.peerId?.trim();
  return peerId ? peerId : null;
}

/**
 * Cheapest proof first: the newest thread page is almost always cached
 * (the user had the conversation open to reply), so this costs no platform
 * call. Pulling the whole 90-day DM list on every send was what spent the
 * account's DM read quota during a back-and-forth conversation.
 */
async function verifyFromThread(
  account: DmAccount,
  conversationId: string,
): Promise<string | null> {
  try {
    const cached = await withPlatformReadCache({
      platform: account.platform,
      accountId: account.id,
      kind: "inbox_dm_thread",
      suffix: dmThreadCacheSuffix(conversationId, null),
      fetch: () => fetchDmMessages(account, conversationId, "", null),
    });
    return verifiedPeerFromThread(cached.data);
  } catch (e) {
    // Throttled thread reads fall through to the (separately metered) list.
    if (e instanceof PlatformApiCooldownError) return null;
    throw e;
  }
}

async function fetchDmsForVerify(
  account: DmAccount,
  fresh: boolean,
): Promise<Awaited<ReturnType<typeof fetchAccountDms>>> {
  // Same plan (and cache entry) as the inbox DM list, so a list the user just
  // looked at verifies the reply for free.
  const lookback = dmListFetchPlan({ since: new Date() });
  const cached = await withPlatformReadCache({
    platform: account.platform,
    accountId: account.id,
    kind: "inbox_dms",
    suffix: lookback.suffix,
    fresh,
    // Same reason as verify-comment: the retry pass must reach the platform,
    // or a conversation opened seconds ago is rejected as "not in this inbox".
    ...(fresh ? { softFreshMinAgeMs: 0 } : {}),
    fetch: () => fetchAccountDms(account, lookback.fetchSince, new Date()),
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

  const threadPeer = await verifyFromThread(account, conversationId);
  if (threadPeer) return { ok: true, peerId: threadPeer };

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
