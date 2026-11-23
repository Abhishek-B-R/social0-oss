import type { AccountWithHealth } from "@/components/app";
import { PLATFORMS } from "@/lib/platforms";
import { sanitizeReturnToPath } from "@/lib/safe-return-to";
import { apiUrl } from "@/lib/env";

/**
 * Optional fields the Accounts table shows when the backend sends them
 * (`dashboard-data.loadConnectionsPageData`). Columns stay hidden until at
 * least one account carries the field, so the page degrades cleanly.
 */
export type AccountExtras = {
  /** Who connected the account (teammate name), for "Added by". */
  addedByName?: string | null;
  addedByUserId?: string | null;
  /** ISO time of the last publication through Social0 on this account. */
  lastPostAt?: string | null;
  /** ISO time the account was connected. */
  createdAt?: string | null;
};

export type AccountRow = AccountWithHealth & AccountExtras;

export type NetworkId = (typeof PLATFORMS)[number]["id"];

export const NETWORK_IDS: NetworkId[] = PLATFORMS.map((p) => p.id);

export function isNetworkId(value: string | null | undefined): value is NetworkId {
  return !!value && (NETWORK_IDS as string[]).includes(value);
}

/** What kind of account each network takes, shown under the name in the connect grid. */
export const NETWORK_ACCOUNT_TYPES: Record<NetworkId, string> = {
  linkedin: "Profile or company page",
  facebook: "Pages only",
  bluesky: "Handle + app password",
  youtube: "Channel (Shorts)",
  pinterest: "Personal or business",
  instagram: "Business or Creator",
  tiktok: "Business or Creator",
  twitter_x: "Any account",
  threads: "Linked to Instagram",
};

/** Display order in the table: networks in the app's usual order. */
const NETWORK_ORDER = new Map<string, number>(NETWORK_IDS.map((id, i) => [id, i]));

const HEALTH_ORDER: Record<AccountRow["health"], number> = {
  expired: 0,
  inactive: 1,
  healthy: 2,
};

/** Broken accounts first (expired, then paused over limit), then by network and handle. */
export function sortAccounts(rows: AccountRow[]): AccountRow[] {
  return [...rows].sort((a, b) => {
    const h = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
    if (h !== 0) return h;
    const n =
      (NETWORK_ORDER.get(a.platform) ?? 99) - (NETWORK_ORDER.get(b.platform) ?? 99);
    if (n !== 0) return n;
    return a.handle.localeCompare(b.handle);
  });
}

export function needsAttention(a: Pick<AccountRow, "health">): boolean {
  return a.health !== "healthy";
}

/** Primary name for an account: display name, else @handle. */
export function accountTitle(a: AccountRow): string {
  return a.platformDisplayName?.trim() || a.handle;
}

/** "@handle (Instagram)" for confirmations and toasts. */
export function accountLongLabel(a: AccountRow, network: string): string {
  const name =
    a.platformDisplayName?.trim() && a.platformUsername?.trim()
      ? `${a.platformDisplayName.trim()} (@${a.platformUsername.trim()})`
      : a.handle;
  return `${name} on ${network}`;
}

/** Second line under the account name: what kind of connection this is. */
export function accountQualifier(
  a: AccountRow,
  meta: Record<string, unknown> | undefined,
): string | null {
  switch (a.platform) {
    case "twitter_x":
      return a.isTwitterPremium ? "Premium" : null;
    case "instagram":
      return a.connectionMethod === "facebook-page"
        ? "via Facebook Page"
        : "Instagram login";
    case "facebook":
      return "Page";
    case "bluesky":
      return "App password";
    case "youtube":
      return "Channel";
    case "pinterest": {
      if (!meta) return null;
      return pinterestDefaultBoardId(meta) ? "Default board set" : null;
    }
    default:
      return null;
  }
}

export function pinterestDefaultBoardId(
  meta: Record<string, unknown> | undefined,
): string | null {
  const v = meta?.pinterestDefaultBoardId;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** OAuth start URL for a network, coming back to `returnTo` afterwards. */
export function connectUrl(networkId: string, returnTo?: string | null): string {
  const base = apiUrl(`/api/connect/${networkId}`);
  const safe = sanitizeReturnToPath(returnTo);
  return safe ? `${base}?returnTo=${encodeURIComponent(safe)}` : base;
}

/** Instagram via a Facebook Page (the second Instagram method). */
export function instagramFacebookConnectUrl(returnTo?: string | null): string {
  const safe = sanitizeReturnToPath(returnTo);
  return safe
    ? apiUrl(`/api/connect/instagram-facebook?returnTo=${encodeURIComponent(safe)}`)
    : apiUrl("/api/connect/instagram-facebook");
}

/**
 * Plain-language message for `?error=` codes the OAuth callbacks send back.
 * Unknown codes that already read as a sentence are shown as-is.
 */
export function connectErrorMessage(
  code: string,
  networkName: string | null,
  serverMessage: string | null,
): { title: string; fix: string | null } {
  const net = networkName ?? "the account";
  switch (code) {
    case "limit":
    case "limit_reached":
      return {
        title: serverMessage?.trim() || "You've reached your account limit.",
        fix: "Upgrade your plan to connect more accounts.",
      };
    case "oauth_failed":
      return { title: `Couldn't connect ${net}.`, fix: "Try connecting again." };
    case "invalid_callback":
    case "invalid_platform":
      return {
        title: `The sign-in with ${net} didn't come back correctly.`,
        fix: "Try connecting again.",
      };
    case "state_mismatch":
    case "invalid_state":
    case "verifier_missing":
    case "verifier_expired":
      return {
        title: "The sign-in took too long or was opened in another browser.",
        fix: "Click Connect again and finish signing in within a few minutes, in this browser.",
      };
    case "platform_not_configured":
    case "credentials_not_configured":
      return {
        title: `${networkName ?? "This network"} isn't available right now.`,
        fix: "Email support@social0.app and we'll sort it out.",
      };
    case "no_facebook_pages":
      return {
        title: "No Facebook Pages were found on that Facebook account.",
        fix: "Social0 posts to Pages. Create a Page (or get admin access to one), then connect again.",
      };
    case "no_instagram_linked":
      return {
        title:
          "Facebook login worked, but none of your Pages has an Instagram Business account linked.",
        fix: "In Meta Business Suite, link a Professional Instagram profile to the Page, then try again.",
      };
    case "rate_limited":
      return {
        title: "Too many connect attempts in a short time.",
        fix: "Wait a few minutes, then try again.",
      };
    case "oauth_session_mismatch":
      return {
        title: "The connection session expired.",
        fix: "Click Connect again while signed in to Social0 in this browser.",
      };
    case "tiktok_scope_required":
      return {
        title: "TikTok didn't grant the access Social0 needs (user.info.basic).",
        fix: "In the TikTok app go to Settings → Security → Manage app permissions, remove Social0, then connect again and approve every permission.",
      };
    case "tiktok_profile_failed":
      return {
        title: "Couldn't load your TikTok profile.",
        fix: "Remove Social0 from TikTok app permissions (Settings → Security → Manage app permissions), then connect again.",
      };
    case "instagram_profile_failed":
      return {
        title: "Instagram connected, but we couldn't load your profile.",
        fix: "Use Reconnect on the expired account (not a fresh Connect), or connect via a Facebook Page instead.",
      };
    case "youtube_scope_required":
      return {
        title: "YouTube didn't grant upload access.",
        fix: "Connect again and tick every permission on Google's consent screen.",
      };
    case "reauth_account_mismatch":
      return {
        title: `You signed in to a different ${networkName ? `${networkName} account` : "account"} than the one you were reconnecting. Nothing was changed.`,
        fix: "Reconnect again and pick the same account. To add the other account, use Connect instead.",
      };
    case "reauth_profile_failed":
      return {
        title: `Couldn't confirm which ${networkName ? `${networkName} account` : "account"} you signed in to, so nothing was changed.`,
        fix: "Try reconnecting again.",
      };
    case "youtube_no_refresh_token":
      return {
        title: "Google didn't give Social0 lasting access to your channel.",
        fix: "Remove Social0 at myaccount.google.com/permissions, then connect again.",
      };
    default:
      // platform-start forwards workspace errors as readable text.
      if (/\s/.test(code)) return { title: code, fix: null };
      return { title: `Something went wrong connecting ${net}.`, fix: "Try connecting again." };
  }
}
