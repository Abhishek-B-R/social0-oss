import type { ConnectedAccount, AccountAlias } from "../types/index.js";

let cachedAccounts: ConnectedAccount[] = [];

export function setAccountCache(accounts: ConnectedAccount[]): void {
  cachedAccounts = accounts;
}

export function getAccountCache(): ConnectedAccount[] {
  return cachedAccounts;
}

export function buildAliases(accounts: ConnectedAccount[]): AccountAlias[] {
  return accounts.map((account, i) => ({ alias: i + 1, account }));
}

export function formatPlatformName(platform: string): string {
  if (platform === "twitter_x") return "twitter";
  return platform.replace(/_/g, " ");
}

export function formatAccountLabel(alias: AccountAlias): string {
  const platform = formatPlatformName(alias.account.platform);
  const name = alias.account.username ?? "Unknown";
  const status =
    alias.account.token_status === "expired"
      ? " (expired)"
      : !alias.account.is_active
        ? " (inactive)"
        : "";
  return `${alias.alias}. ${platform} (${name})${status}`;
}

export function resolveAliasToId(alias: number, accounts?: ConnectedAccount[]): string | null {
  const list = accounts ?? cachedAccounts;
  const index = alias - 1;
  if (index < 0 || index >= list.length) return null;
  return list[index].id;
}

export function resolveAliasesToIds(aliases: number[], accounts?: ConnectedAccount[]): string[] {
  const list = accounts ?? cachedAccounts;
  return aliases
    .map((a) => resolveAliasToId(a, list))
    .filter((id): id is string => id !== null);
}

export function resolvePlatformToIds(
  platforms: string[],
  accounts?: ConnectedAccount[],
): string[] {
  const list = accounts ?? cachedAccounts;
  const ids: string[] = [];
  for (const platform of platforms) {
    const normalized = platform.toLowerCase().replace(/^twitter$/, "twitter_x");
    const match = list.find(
      (a) =>
        a.platform === normalized ||
        formatPlatformName(a.platform) === platform.toLowerCase(),
    );
    if (match && !ids.includes(match.id)) ids.push(match.id);
  }
  return ids;
}

export function resolveAccountRefs(
  refs: string[],
  accounts?: ConnectedAccount[],
): string[] {
  const list = accounts ?? cachedAccounts;
  const ids: string[] = [];
  for (const ref of refs) {
    const num = Number(ref);
    if (!Number.isNaN(num) && Number.isInteger(num)) {
      const id = resolveAliasToId(num, list);
      if (id) ids.push(id);
    } else {
      const platformIds = resolvePlatformToIds([ref], list);
      ids.push(...platformIds);
    }
  }
  return [...new Set(ids)];
}

export function findAliasById(id: string, accounts?: ConnectedAccount[]): number | null {
  const list = accounts ?? cachedAccounts;
  const index = list.findIndex((a) => a.id === id);
  return index >= 0 ? index + 1 : null;
}
