import type { ConnectedAccount, Platform } from "../types/index.js";
import { SUPPORTED_PLATFORMS } from "../types/index.js";
import { isUuid } from "../utils/index.js";

const PLATFORM_ALIASES: Record<string, Platform> = {
  linkedin: "linkedin",
  li: "linkedin",
  facebook: "facebook",
  fb: "facebook",
  instagram: "instagram",
  ig: "instagram",
  youtube: "youtube",
  yt: "youtube",
  pinterest: "pinterest",
  pin: "pinterest",
  tiktok: "tiktok",
  twitter: "twitter_x",
  x: "twitter_x",
  twitter_x: "twitter_x",
  threads: "threads",
  bluesky: "bluesky",
  bsky: "bluesky",
};

export function normalizePlatform(value: string): Platform | null {
  const key = value.trim().toLowerCase();
  return PLATFORM_ALIASES[key] ?? (SUPPORTED_PLATFORMS.includes(key as Platform) ? (key as Platform) : null);
}

export function resolveAccountIds(
  platforms: string[],
  accounts: ConnectedAccount[],
): { accountIds: string[]; errors: string[] } {
  const accountIds: string[] = [];
  const errors: string[] = [];
  const activeAccounts = accounts.filter((a) => a.is_active);

  for (const item of platforms) {
    if (isUuid(item)) {
      const match = activeAccounts.find((a) => a.id === item);
      if (match) {
        accountIds.push(match.id);
      } else {
        errors.push(`No active connected account found for ID ${item}`);
      }
      continue;
    }

    const platform = normalizePlatform(item);
    if (!platform) {
      errors.push(`Unknown platform "${item}". Supported: ${SUPPORTED_PLATFORMS.join(", ")}`);
      continue;
    }

    const matches = activeAccounts.filter((a) => a.platform === platform);
    if (matches.length === 0) {
      errors.push(`No connected ${platform} account. Connect it at https://social0.app/dashboard/connections`);
    } else if (matches.length > 1) {
      const options = matches
        .map((a) => `${a.id}${a.username ? ` (@${a.username})` : ""}`)
        .join(", ");
      errors.push(
        `Multiple ${platform} accounts connected (${options}). Call list_accounts, then pass one account UUID instead of the platform name.`,
      );
    } else {
      accountIds.push(matches[0]!.id);
    }
  }

  return { accountIds: [...new Set(accountIds)], errors };
}

export function formatAccountsList(accounts: ConnectedAccount[]): string {
  if (accounts.length === 0) {
    return "No connected accounts. Connect platforms at https://social0.app/dashboard/connections";
  }

  return accounts
    .map((a) => {
      const status = a.is_active ? a.token_status : "inactive";
      const username = a.username ? `@${a.username}` : "(no username)";
      return `- ${a.platform} ${username} [${status}] id=${a.id}`;
    })
    .join("\n");
}

export function formatPostSummary(post: {
  id: string;
  content: string;
  status: string;
  scheduled_at?: string | null;
}): string {
  const preview = post.content.length > 80 ? `${post.content.slice(0, 80)}…` : post.content;
  const schedule = post.scheduled_at ? ` scheduled=${post.scheduled_at}` : "";
  return `id=${post.id} [${post.status}]${schedule} — "${preview}"`;
}
