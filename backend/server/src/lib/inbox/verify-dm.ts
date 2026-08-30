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
  return threads.some((t) => t.conversationId === conversationId);
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
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!conversationId.trim()) {
    return { ok: false, error: "Invalid conversation id." };
  }

  for (const fresh of [false, true] as const) {
    const result = await fetchDmsForVerify(account, fresh);
    if (dmConversationInList(result.threads, conversationId)) {
      return { ok: true };
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
