/**
 * Which connected accounts a post may target.
 *
 * The plan's `maxConnectedAccounts` cap is enforced by
 * `syncConnectedAccountsToLimit`, which turns `connected_accounts.is_active`
 * off for every account past the cap (it is the only writer of `false`). The
 * SPA hides those rows, but the server has to refuse them too: RPC and `/v1`
 * take raw account ids, and a post saved before a downgrade still points at
 * them when it publishes.
 */

export const ACCOUNT_OVER_PLAN_LIMIT_ERROR =
  "This account is over your plan's connected-account limit. Upgrade your plan or remove another account to publish to it.";

export const SELECTED_ACCOUNT_OVER_PLAN_LIMIT_ERROR =
  "One or more selected accounts are over your plan's connected-account limit. Upgrade your plan or remove another account to post to them.";

export type SelectedAccountsCheck =
  | { ok: true }
  | { ok: false; reason: "not_found" | "over_limit" };

/**
 * `rows` are the accounts the caller's scope query found for `requestedIds`.
 * Every requested id must be among them, and none may be switched off by the
 * plan cap. A null `isActive` (column default never applied) counts as active,
 * as it does at publish time.
 */
export function checkSelectedAccounts(
  requestedIds: readonly string[],
  rows: ReadonlyArray<{ id: string; isActive: boolean | null }>,
): SelectedAccountsCheck {
  const found = new Map(rows.map((r) => [r.id.toLowerCase(), r]));
  const unique = [...new Set(requestedIds.map((id) => id.toLowerCase()))];
  if (unique.length === 0 || !unique.every((id) => found.has(id))) {
    return { ok: false, reason: "not_found" };
  }
  if (unique.some((id) => found.get(id)!.isActive === false)) {
    return { ok: false, reason: "over_limit" };
  }
  return { ok: true };
}
