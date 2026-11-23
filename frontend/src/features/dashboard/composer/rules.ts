import { DEFAULT_TIKTOK_POST_SETTINGS } from "@/components/tiktok-post-settings";
import { getAccountsExceededByAttachments } from "@/lib/media-limits";
import {
  getAccountsOverVideoLimit,
  getLimitForAccount,
} from "@/lib/platform-limits";
import { reconnectUrl } from "@/lib/account-reconnect";
import {
  getAspectRatioGuidance,
  getTikTokVideoResolutionGuidance,
} from "@/lib/video-aspect-ratio";
import { networkLabel } from "@/components/app";
import { unsupportedReason } from "./content-type";
import type {
  ComposerAccount,
  ComposerContentType,
  ComposerDraft,
  ComposerIssue,
  ComposerMedia,
  ComposerWarning,
} from "./types";

export const TIKTOK_MAX_IMAGES = 35;
export const THREAD_MAX_MEDIA_PER_POST = 4;

/** How many attachments each network publishes per post (extra are ignored). */
const MEDIA_CAP: Record<string, number> = {
  twitter_x: 4,
  bluesky: 4,
  threads: 4,
  pinterest: 1,
  instagram: 10,
  linkedin: 20,
  facebook: 20,
};

export type NetworkSummary = {
  network: string;
  accounts: ComposerAccount[];
  /** Characters in the caption this network gets (longest part for threads). */
  count: number;
  /** Strictest limit across this network's selected accounts. */
  limit: number;
  overridden: boolean;
  /** "blocked" = an issue stops this network; "over" = will be trimmed. */
  state: "ok" | "near" | "over" | "blocked";
  /** Short chip text for a blocked network ("needs media"). */
  note?: string;
};

export type ValidationResult = {
  issues: ComposerIssue[];
  warnings: ComposerWarning[];
  networks: NetworkSummary[];
  /** Selected accounts with no blocking issue. */
  okAccountIds: string[];
  /** True when an issue blocks the whole post (no "post to the rest"). */
  hasGlobalIssue: boolean;
};

export function allMedia(draft: ComposerDraft): ComposerMedia[] {
  return draft.parts.flatMap((p) => p.media);
}

/**
 * Caption a network receives: its override when it has text, else the main
 * text (an emptied override box shows the main caption as its placeholder,
 * and buildMetadata sends the main caption for it).
 */
export function captionFor(draft: ComposerDraft, network: string): string {
  const o = draft.captionOverrides[network];
  return o != null && o.trim() ? o : (draft.parts[0]?.text ?? "");
}

/**
 * Caption one account receives: its own restored per-account caption when
 * it has one, else its network's caption.
 */
export function captionForAccount(draft: ComposerDraft, account: ComposerAccount): string {
  const own = draft.accountCaptions?.[account.id];
  return own != null && own.trim() ? own : captionFor(draft, account.platform);
}

function names(networks: Iterable<string>): string {
  const list = [...new Set(networks)].map(networkLabel);
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export function validateComposer(input: {
  draft: ComposerDraft;
  accounts: readonly ComposerAccount[];
  contentType: ComposerContentType;
  /** TikTok creator max video duration per account, when known. */
  tiktokMaxDuration?: Record<string, number>;
}): ValidationResult {
  const { draft, accounts, contentType } = input;
  const selected = accounts.filter((a) => draft.accountIds.includes(a.id));
  const issues: ComposerIssue[] = [];
  const warnings: ComposerWarning[] = [];
  const isThread = contentType === "threads";
  const media = allMedia(draft);
  const mainMedia = draft.parts[0]?.media ?? [];
  const images = mainMedia.filter((m) => m.kind === "image");
  const videos = media.filter((m) => m.kind === "video");
  const has = (p: string) => selected.some((a) => a.platform === p);
  const of = (p: string) => selected.filter((a) => a.platform === p);

  // ---- whole-post problems -------------------------------------------
  const texts = draft.parts.map((p) => p.text.trim());
  // The first post carries the thread (it's the root), so it needs text.
  if (!texts[0]) {
    issues.push({
      id: "no-text",
      message: isThread ? "Add text to the first post." : "Add a caption.",
      accountIds: [],
    });
  }
  if (selected.length === 0) {
    issues.push({
      id: "no-accounts",
      message: "Pick at least one account to post to.",
      accountIds: [],
    });
  }

  // ---- per account ---------------------------------------------------
  const unsupportedByNetwork = new Map<string, ComposerAccount[]>();
  for (const a of selected) {
    if (a.tokenExpired) {
      issues.push({
        id: `expired-${a.id}`,
        message: `${networkLabel(a.platform)} @${a.platformUsername ?? "account"} needs to be reconnected.`,
        accountIds: [a.id],
        network: a.platform,
        fix: {
          kind: "reconnect",
          href: reconnectUrl(a),
          label: "Reconnect",
        },
      });
      continue;
    }
    const why = unsupportedReason(a.platform, contentType, networkLabel(a.platform));
    if (why) {
      const list = unsupportedByNetwork.get(a.platform) ?? [];
      list.push(a);
      unsupportedByNetwork.set(a.platform, list);
    }
  }
  for (const [network, list] of unsupportedByNetwork) {
    const reason = unsupportedReason(network, contentType, networkLabel(network))!;
    issues.push({
      id: `unsupported-${network}`,
      message: reason,
      accountIds: list.map((a) => a.id),
      network,
      fix:
        contentType === "text"
          ? { kind: "add-media", label: "Add media" }
          : { kind: "deselect", label: `Post without ${networkLabel(network)}` },
    });
  }

  // Video length per platform (longest video in the post).
  const maxDuration = videos.reduce((m, v) => Math.max(m, v.durationSec ?? 0), 0);
  if (maxDuration > 0) {
    const limits = getAccountsOverVideoLimit(selected, maxDuration);
    const byNetwork = new Map<string, string[]>();
    for (const id of limits.accountIds) {
      const acc = selected.find((a) => a.id === id);
      if (!acc) continue;
      byNetwork.set(acc.platform, [...(byNetwork.get(acc.platform) ?? []), id]);
    }
    for (const [network, ids] of byNetwork) {
      const w = limits.warnings.find((x) => x.platform === network);
      issues.push({
        id: `video-length-${network}`,
        message: w?.message ?? `Video is too long for ${networkLabel(network)}.`,
        accountIds: ids,
        network,
        fix: { kind: "deselect", label: `Post without ${networkLabel(network)}` },
      });
    }
    for (const w of limits.softWarnings) {
      warnings.push({ id: `video-soft-${w.platform}`, message: w.message, network: w.platform });
    }
  }

  // Video file size per platform.
  const sized = media
    .filter((m): m is ComposerMedia & { file: File } => m.kind === "video" && !!m.file)
    .map((m) => ({ file: m.file }));
  if (sized.length > 0) {
    const exceeded = getAccountsExceededByAttachments(selected, sized);
    const byNetwork = new Map<string, string[]>();
    for (const id of exceeded.accountIds) {
      const acc = selected.find((a) => a.id === id);
      if (!acc) continue;
      byNetwork.set(acc.platform, [...(byNetwork.get(acc.platform) ?? []), id]);
    }
    for (const [network, ids] of byNetwork) {
      issues.push({
        id: `video-size-${network}`,
        message: exceeded.reasons[ids[0]!] ?? `Video file is too large for ${networkLabel(network)}.`,
        accountIds: ids,
        network,
        fix: { kind: "deselect", label: `Post without ${networkLabel(network)}` },
      });
    }
  }

  // TikTok.
  if (has("tiktok")) {
    const tiktok = of("tiktok");
    if (contentType === "image" && images.length > TIKTOK_MAX_IMAGES) {
      issues.push({
        id: "tiktok-35",
        message: `TikTok allows at most ${TIKTOK_MAX_IMAGES} images per post. Remove ${images.length - TIKTOK_MAX_IMAGES} or post without TikTok.`,
        accountIds: tiktok.map((a) => a.id),
        network: "tiktok",
      });
    }
    if (
      contentType === "collection" &&
      videos.length === 0 &&
      images.length > TIKTOK_MAX_IMAGES
    ) {
      issues.push({
        id: "tiktok-35",
        message: `TikTok allows at most ${TIKTOK_MAX_IMAGES} images per post.`,
        accountIds: tiktok.map((a) => a.id),
        network: "tiktok",
      });
    }
    for (const a of tiktok) {
      const s = draft.tiktok[a.id] ?? DEFAULT_TIKTOK_POST_SETTINGS;
      const handle = `@${a.platformUsername ?? "TikTok"}`;
      if (!s.privacy_level?.trim()) {
        issues.push({
          id: `tiktok-privacy-${a.id}`,
          message: `TikTok ${handle}: choose who can see this post.`,
          accountIds: [a.id],
          network: "tiktok",
          fix: { kind: "open-setting", setting: "tiktok", label: "TikTok settings" },
        });
      }
      if (s.brand_content_toggle && !s.brand_organic && !s.brand_content) {
        issues.push({
          id: `tiktok-brand-${a.id}`,
          message: `TikTok ${handle}: you said this promotes a brand. Pick "Your brand" or "Branded content".`,
          accountIds: [a.id],
          network: "tiktok",
          fix: { kind: "open-setting", setting: "tiktok", label: "TikTok settings" },
        });
      }
      if (s.brand_content && s.privacy_level === "SELF_ONLY") {
        issues.push({
          id: `tiktok-branded-private-${a.id}`,
          message: `TikTok ${handle}: branded content can't be private. Choose Public or Friends.`,
          accountIds: [a.id],
          network: "tiktok",
          fix: { kind: "open-setting", setting: "tiktok", label: "TikTok settings" },
        });
      }
      const maxDur = input.tiktokMaxDuration?.[a.id];
      if (typeof maxDur === "number" && maxDur > 0 && maxDuration > maxDur) {
        issues.push({
          id: `tiktok-duration-${a.id}`,
          message: `TikTok ${handle} allows videos up to ${maxDur}s. Shorten the video or post without this account.`,
          accountIds: [a.id],
          network: "tiktok",
          fix: { kind: "deselect", label: "Post without it" },
        });
      }
    }
    if (
      images.some(
        (m) => m.mimeType === "image/png" || m.file?.name.toLowerCase().endsWith(".png"),
      )
    ) {
      warnings.push({
        id: "tiktok-png",
        message: "PNG images will be converted to JPEG for TikTok.",
        network: "tiktok",
        tone: "info",
      });
    }
    if (contentType === "video") {
      const v = videos[0];
      if (v?.width && v.height) {
        const g = getTikTokVideoResolutionGuidance(v.width, v.height);
        if (g) warnings.push({ id: "tiktok-resolution", message: g.message, network: "tiktok" });
      }
    }
  }

  // Pinterest board.
  if (has("pinterest")) {
    const pins = of("pinterest").filter((a) => !draft.pinterest[a.id]?.boardId?.trim());
    if (pins.length > 0) {
      const one = pins.length === 1 ? pins[0]!.platformUsername?.trim() : null;
      issues.push({
        id: "pinterest-board",
        message: one
          ? `Pick a Pinterest board for @${one}.`
          : pins.length === 1
            ? "Pick a Pinterest board."
            : `Pick a board for each Pinterest account (${pins.length} missing).`,
        accountIds: pins.map((a) => a.id),
        network: "pinterest",
        fix: { kind: "open-setting", setting: "pinterest", label: "Pick a board" },
      });
    }
  }

  // X thread media rules (per tweet: ≤4 images, or one video, not both).
  if (isThread && has("twitter_x")) {
    draft.parts.forEach((part, i) => {
      const imgs = part.media.filter((m) => m.kind === "image").length;
      const vids = part.media.length - imgs;
      let message: string | null = null;
      if (vids > 0 && imgs > 0) {
        message = `X: post ${i + 1} mixes images and a video. X allows one or the other per post.`;
      } else if (vids > 1) {
        message = `X: post ${i + 1} has ${vids} videos. X allows one video per post.`;
      } else if (imgs > 4) {
        message = `X: post ${i + 1} has ${imgs} images. X allows up to 4.`;
      }
      if (message) {
        issues.push({
          id: `x-thread-media-${part.id}`,
          message,
          accountIds: of("twitter_x").map((a) => a.id),
          network: "twitter_x",
        });
      }
    });
  }

  // ---- non-blocking warnings -------------------------------------------
  if (!isThread && mainMedia.length > 0) {
    const n = mainMedia.length;
    const four = ["twitter_x", "bluesky", "threads"].filter(
      (p) => has(p) && n > MEDIA_CAP[p]!,
    );
    if (four.length > 0) {
      warnings.push({
        id: "cap-4",
        message: `${names(four)} take up to 4 attachments per post. Only the first 4 will go there.`,
      });
    }
    if (has("pinterest") && n > 1) {
      warnings.push({
        id: "cap-pinterest",
        message: "Pinterest takes 1 attachment per pin. Only the first one will be used.",
        network: "pinterest",
      });
    }
    if (has("instagram") && n > 10) {
      warnings.push({
        id: "cap-instagram",
        message: "Instagram takes up to 10 items per carousel. Only the first 10 will go there.",
        network: "instagram",
      });
    }
    const twenty = ["linkedin", "facebook"].filter((p) => has(p) && n > 20);
    if (twenty.length > 0 && contentType === "image") {
      warnings.push({
        id: "cap-20",
        message: `${names(twenty)} take up to 20 images per post. Only the first 20 will go there.`,
      });
    }
  }

  if (isThread && has("bluesky")) {
    const mixed = draft.parts.some((p) => {
      const v = p.media.filter((m) => m.kind === "video").length;
      return v > 1 || (v > 0 && p.media.length > v);
    });
    if (mixed) {
      warnings.push({
        id: "bluesky-thread-media",
        message:
          "Bluesky allows one video per post and no mixing with images. Only the first video in those posts goes to Bluesky.",
        network: "bluesky",
      });
    }
  }

  if (
    contentType === "text" &&
    has("twitter_x") &&
    captionFor(draft, "twitter_x").includes("---")
  ) {
    const parts = captionFor(draft, "twitter_x")
      .split("---")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      warnings.push({
        id: "x-text-thread",
        message:
          "X will post this as a thread: each part between --- is its own post. Media only shows on the first one.",
        network: "twitter_x",
        tone: "info",
      });
    }
  }

  const oddVideo = videos.find(
    (v) => v.width && v.height && getAspectRatioGuidance(v.width / v.height),
  );
  if (oddVideo) {
    const g = getAspectRatioGuidance(oddVideo.width! / oddVideo.height!);
    if (g) warnings.push({ id: "aspect", message: g.message });
  }

  if (has("instagram") && !isThread) {
    const outside = images.filter((m) => {
      if (!m.width || !m.height) return false;
      const r = m.width / m.height;
      return r < 0.8 - 0.01 || r > 1.91 + 0.01;
    });
    if (outside.length > 0) {
      warnings.push({
        id: "instagram-ratio",
        message: `Instagram crops images outside 4:5 to 1.91:1. ${outside.length === 1 ? "One image is" : `${outside.length} images are`} outside that range.`,
        network: "instagram",
      });
    }
  }

  // ---- network chips ---------------------------------------------------
  const networks: NetworkSummary[] = [];
  const order: string[] = [];
  for (const a of selected) if (!order.includes(a.platform)) order.push(a.platform);
  for (const network of order) {
    const accs = of(network);
    const limit = Math.min(...accs.map((a) => getLimitForAccount(a)));
    const count = isThread
      ? Math.max(0, ...draft.parts.map((p) => p.text.trim().length))
      : Math.max(0, ...accs.map((a) => captionForAccount(draft, a).trim().length));
    const blocked = issues.find(
      (i) => i.accountIds.length > 0 && accs.every((a) => i.accountIds.includes(a.id)),
    );
    let note: string | undefined;
    if (blocked) {
      if (blocked.id.startsWith("unsupported")) {
        note = contentType === "text" ? (network === "youtube" ? "needs video" : "needs media") : "can't post this";
      } else if (blocked.id === "pinterest-board") note = "pick a board";
      else if (blocked.id.startsWith("expired")) note = "reconnect";
      else if (blocked.id.startsWith("video-length")) note = "video too long";
      else if (blocked.id.startsWith("video-size")) note = "file too large";
      else note = "1 issue";
    }
    networks.push({
      network,
      accounts: accs,
      count,
      limit,
      overridden:
        !isThread &&
        (draft.captionOverrides[network] != null ||
          accs.some((a) => draft.accountCaptions?.[a.id] != null)),
      state: blocked
        ? "blocked"
        : count > limit
          ? "over"
          : count >= limit * 0.9
            ? "near"
            : "ok",
      note,
    });
    if (!blocked && count > limit) {
      warnings.push({
        id: `trim-${network}`,
        message: `${networkLabel(network)} allows ${limit.toLocaleString()} characters. We'll trim the caption there.`,
        network,
      });
    }
  }

  const blockedIds = new Set(issues.flatMap((i) => i.accountIds));
  const okAccountIds = selected.filter((a) => !blockedIds.has(a.id)).map((a) => a.id);
  return {
    issues,
    warnings,
    networks,
    okAccountIds,
    hasGlobalIssue: issues.some((i) => i.accountIds.length === 0),
  };
}
