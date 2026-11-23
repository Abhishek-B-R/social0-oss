import { resolveAccountAccess } from "./account-access.js";

type AccessAccount = Parameters<typeof resolveAccountAccess>[0];
export type AccountAccess = Awaited<ReturnType<typeof resolveAccountAccess>>;
export type AccountAccessResolver = (account: AccessAccount) => Promise<AccountAccess>;

/**
 * Per-request token resolver for live reads: at most one resolution per
 * account, however many publications share it.
 *
 * Resolving is not free. Refreshable platforms take a Redis lock and a
 * `connected_accounts` read, and YouTube adds two Google tokeninfo calls. So
 * live-read callers create one resolver per request and call it only inside a
 * `withPlatformReadCache` `fetch` (a cache miss): warm reads never touch a
 * token. A failed resolution stays failed for the rest of the request, so a
 * broken account is not retried once per publication.
 */
export function createAccountAccessResolver(): AccountAccessResolver {
  const byAccount = new Map<string, Promise<AccountAccess>>();
  return (account) => {
    let access = byAccount.get(account.id);
    if (!access) {
      access = resolveAccountAccess(account);
      byAccount.set(account.id, access);
    }
    return access;
  };
}
