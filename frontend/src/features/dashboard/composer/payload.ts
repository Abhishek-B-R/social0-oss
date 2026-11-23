import {
  DEFAULT_TIKTOK_POST_SETTINGS,
  type TikTokPostSettings,
} from "@/components/tiktok-post-settings";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import { applyBulkAutoFeaturesToScheduledMetadata } from "@/lib/bulk-auto-features-metadata";
import type { PostMediaRow } from "@/features/dashboard/posts/post-types";
import { localId, mediaFromRows } from "./media-intake";
import type {
  ComposerAccount,
  ComposerContentType,
  ComposerDraft,
  ComposerPart,
  SubmitAction,
} from "./types";

/** Separator the backend and old Threads form used between thread posts. */
export const THREAD_SEPARATOR = "\n\n---\n\n";

export function emptyDraft(): ComposerDraft {
  return {
    parts: [{ id: localId("p"), text: "", media: [] }],
    accountIds: [],
    captionOverrides: {},
    tiktok: {},
    tiktokAutoAddMusic: true,
    pinterest: {},
    x: { madeWithAi: false, paidPartnership: false },
    youtubeTitle: "",
    instagram: { isTrialReel: false },
    autoRepost: null,
    autoPlug: null,
    scheduledAt: null,
    queueSlotId: null,
    timezoneOverride: null,
    initialContentType: null,
  };
}

/** Parts that will be published (empty parts in a thread are dropped). */
export function publishableParts(draft: ComposerDraft): ComposerPart[] {
  if (draft.parts.length <= 1) return draft.parts.slice(0, 1);
  return draft.parts.filter((p) => p.text.trim() || p.media.length > 0);
}

/** The `content` string sent to createPost / updatePost. */
export function contentFor(draft: ComposerDraft, type: ComposerContentType): string {
  if (type === "threads") {
    return publishableParts(draft)
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join(THREAD_SEPARATOR);
  }
  return (draft.parts[0]?.text ?? "").trim();
}

/**
 * `posts.metadata` for a submit, matching what the five old forms stored:
 * contentType, twitterThread, tiktok / pinterest / x / youtube / instagram /
 * video, accountCaptions, bulkAutoFeatures (scheduled, queued, draft).
 * Publish now goes through the same server enqueue as every other submit,
 * so publish-time choices (TikTok photo auto music) must live here.
 */
export function buildMetadata(input: {
  draft: ComposerDraft;
  type: ComposerContentType;
  accounts: readonly ComposerAccount[];
  /** Media ids per publishable part, in order. */
  partMediaIds: string[][];
  action: SubmitAction;
}): Record<string, unknown> {
  const { draft, type, accounts, partMediaIds, action } = input;
  const metadata: Record<string, unknown> = { contentType: type };
  const of = (p: string) => accounts.filter((a) => a.platform === p);

  if (type === "threads") {
    const parts = publishableParts(draft);
    metadata.twitterThread = {
      version: 1,
      separator: THREAD_SEPARATOR,
      parts: parts.map((p, i) => ({
        text: p.text.trim(),
        mediaIds: partMediaIds[i] ?? [],
      })),
    };
  }

  const tiktok = of("tiktok");
  if (tiktok.length > 0) {
    metadata.tiktok = Object.fromEntries(
      tiktok.map((a) => [a.id, draft.tiktok[a.id] ?? DEFAULT_TIKTOK_POST_SETTINGS]),
    );
    // Photo posts only. Every publish path (now, scheduled, queued) reads the
    // user's choice from here.
    if (type === "image") metadata.tiktokAutoAddMusic = draft.tiktokAutoAddMusic;
  }

  const pins = of("pinterest");
  if (pins.length > 0) {
    const out: Record<string, { boardId: string; title?: string; link?: string }> = {};
    for (const a of pins) {
      const s = draft.pinterest[a.id];
      if (!s?.boardId?.trim()) continue;
      out[a.id] = {
        boardId: s.boardId.trim(),
        ...(s.title?.trim() ? { title: s.title.trim().slice(0, 100) } : {}),
        ...(s.link?.trim() ? { link: s.link.trim() } : {}),
      };
    }
    metadata.pinterest = out;
  }

  if (of("twitter_x").length > 0) {
    metadata.x = {
      madeWithAi: draft.x.madeWithAi,
      paidPartnership: draft.x.paidPartnership,
    };
  }

  if (type !== "threads") {
    // An emptied caption box means "use the main caption" (its placeholder
    // shows the main text), same as captionForAccount in rules.ts.
    const accountCaptions: Record<string, string> = {};
    for (const a of accounts) {
      const o =
        draft.accountCaptions?.[a.id]?.trim() || draft.captionOverrides[a.platform]?.trim();
      if (o) accountCaptions[a.id] = o;
    }
    if (Object.keys(accountCaptions).length > 0) {
      metadata.accountCaptions = accountCaptions;
    }
  }

  const video = type === "video" ? draft.parts[0]?.media.find((m) => m.kind === "video") : null;
  if (type === "video" && of("youtube").length > 0 && draft.youtubeTitle.trim()) {
    metadata.youtube = { title: draft.youtubeTitle.trim().slice(0, 100) };
  }
  if (video && (video.durationSec ?? 0) > 0) {
    // Measured dimensions win; media restored from a saved post has none, so
    // it keeps the orientation saved with it. Unknown stays unset rather
    // than false (YouTube reads isVertical === true as "Short").
    const isVertical =
      video.width && video.height ? video.height > video.width : video.isVertical;
    metadata.video = {
      durationSeconds: video.durationSec,
      ...(typeof isVertical === "boolean" ? { isVertical } : {}),
    };
  }

  // Reel cover / trial reel, per Instagram account. The publish pipeline
  // reads them from here on every path (publish now, scheduled, queue).
  const instagram = of("instagram");
  if (type === "video" && instagram.length > 0) {
    const coverImageUrl = draft.instagram.coverImageUrl?.trim();
    metadata.instagram = Object.fromEntries(
      instagram.map((a) => [
        a.id,
        {
          ...(coverImageUrl ? { coverImageUrl } : {}),
          isTrialReel: draft.instagram.isTrialReel,
        },
      ]),
    );
  }

  // Automations ride on the saved post for scheduled / queued posts (the
  // pipeline sets them up after X publishes) and on drafts (so saving or
  // moving to drafts keeps them). Publish now sets them up client-side.
  if (action === "schedule" || action === "queue" || action === "draft") {
    applyBulkAutoFeaturesToScheduledMetadata(metadata, {
      hasTwitterXSelected: of("twitter_x").length > 0,
      resurfaceConfig: draft.autoRepost,
      autoPlugConfig: draft.autoPlug,
    });
  }
  return metadata;
}

/** Options the server can't read from metadata need the client publish. */
export function needsPublishOptions(
  draft: ComposerDraft,
  type: ComposerContentType,
  accounts: readonly ComposerAccount[],
): boolean {
  const has = (p: string) => accounts.some((a) => a.platform === p);
  if (type === "image" && has("tiktok") && !draft.tiktokAutoAddMusic) return true;
  return false;
}

export function publishOptionsFor(
  draft: ComposerDraft,
  type: ComposerContentType,
  accounts: readonly ComposerAccount[],
) {
  const has = (p: string) => accounts.some((a) => a.platform === p);
  return {
    ...(type === "image" && has("tiktok")
      ? { tiktokConfig: { autoAddMusic: draft.tiktokAutoAddMusic } }
      : {}),
  };
}

// ---- restore ------------------------------------------------------------

export type LoadedPost = {
  id: string;
  originalContent: string | null;
  scheduledAt: Date | string | null;
  connectedAccountIds: string[];
  media: PostMediaRow[];
  metadata: Record<string, unknown> | null;
  queueSlotId?: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function normalizeTikTok(t: Record<string, unknown>): TikTokPostSettings {
  return {
    privacy_level: typeof t.privacy_level === "string" ? t.privacy_level : "",
    video_title: typeof t.video_title === "string" ? t.video_title : "",
    disable_comment: !!t.disable_comment,
    disable_duet: !!t.disable_duet,
    disable_stitch: !!t.disable_stitch,
    brand_content_toggle: !!t.brand_content_toggle,
    brand_organic: !!t.brand_organic,
    brand_content: !!t.brand_content,
    post_as_draft: !!t.post_as_draft,
    mark_ai_generated: !!t.mark_ai_generated,
    tiktok_post_consent: t.tiktok_post_consent !== false,
  };
}

/**
 * Composer state from a saved post (draft, scheduled, or published post
 * being reposted). Accounts whose sign-in expired are left unselected,
 * as the old forms did.
 */
export function draftFromPost(
  post: LoadedPost,
  accounts: readonly ComposerAccount[],
  opts: { keepSchedule: boolean },
): ComposerDraft {
  const base = emptyDraft();
  const meta = post.metadata ?? {};
  const valid = new Set(accounts.filter((a) => !a.tokenExpired).map((a) => a.id));
  const accountIds = post.connectedAccountIds.filter((id) => valid.has(id));
  const byId = new Map(post.media.map((m) => [m.id, m]));
  const videoMeta = asRecord(meta.video) as
    | { durationSeconds?: number; isVertical?: boolean }
    | null;

  // Parts: thread metadata first, then the separator in the text.
  let parts: ComposerPart[];
  const thread = asRecord(meta.twitterThread);
  const threadParts = Array.isArray(thread?.parts) ? (thread!.parts as unknown[]) : null;
  if (threadParts && threadParts.length > 0) {
    parts = threadParts.map((raw) => {
      const r = asRecord(raw) ?? {};
      const ids = Array.isArray(r.mediaIds)
        ? (r.mediaIds as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const rows = ids
        .map((id) => byId.get(id))
        .filter((m): m is PostMediaRow => !!m && !!(m.url || m.thumbnailUrl));
      return {
        id: localId("p"),
        text: typeof r.text === "string" ? r.text : "",
        media: mediaFromRows(rows),
      };
    });
  } else if (meta.contentType === "threads" && (post.originalContent ?? "").includes("---")) {
    parts = (post.originalContent ?? "")
      .split(THREAD_SEPARATOR)
      .map((text) => ({ id: localId("p"), text: text.trim(), media: [] }));
  } else {
    parts = [
      {
        id: localId("p"),
        text: post.originalContent ?? "",
        media: mediaFromRows(post.media, videoMeta),
      },
    ];
  }
  if (parts.length === 0) parts = base.parts;

  const x = asRecord(meta.x);
  const tiktokMeta = asRecord(meta.tiktok) ?? {};
  const pinMeta = asRecord(meta.pinterest) ?? {};
  const tiktok: Record<string, TikTokPostSettings> = {};
  const pinterest: Record<string, PinterestPostSettings> = {};
  for (const id of accountIds) {
    const acc = accounts.find((a) => a.id === id);
    if (acc?.platform === "tiktok") {
      const t = asRecord(tiktokMeta[id]);
      if (t) tiktok[id] = normalizeTikTok(t);
    }
    if (acc?.platform === "pinterest") {
      const p = asRecord(pinMeta[id]);
      if (p) {
        pinterest[id] = {
          boardId: typeof p.boardId === "string" ? p.boardId : "",
          title: typeof p.title === "string" ? p.title : "",
          link: typeof p.link === "string" ? p.link : "",
          rememberBoard: false,
          rememberLink: false,
        };
      }
    }
  }

  // accountCaptions → one override per network when that network's accounts
  // agree; per-account captions when they differ (the old Text form allowed
  // that), so saving again doesn't overwrite one account's text.
  const captionOverrides: Record<string, string> = {};
  const perAccount: Record<string, string> = {};
  const savedCaptions = asRecord(meta.accountCaptions) ?? {};
  const mainText = (post.originalContent ?? "").trim();
  const byNetwork = new Map<string, Array<{ id: string; caption: string | null }>>();
  for (const id of accountIds) {
    const acc = accounts.find((a) => a.id === id);
    if (!acc) continue;
    const v = savedCaptions[id];
    const caption = typeof v === "string" && v.trim() !== mainText ? v : null;
    const list = byNetwork.get(acc.platform) ?? [];
    list.push({ id, caption });
    byNetwork.set(acc.platform, list);
  }
  for (const [network, list] of byNetwork) {
    const distinct = new Set(list.map((e) => e.caption));
    if (distinct.size === 1) {
      const only = list[0]?.caption;
      if (only != null) captionOverrides[network] = only;
      continue;
    }
    for (const e of list) if (e.caption != null) perAccount[e.id] = e.caption;
  }

  const bulk = asRecord(meta.bulkAutoFeatures);
  const repost = asRecord(bulk?.autoRepostConfig);
  const plug = asRecord(bulk?.autoPlugConfig);
  const autoRepost: AutoResurfaceConfig | null =
    repost && typeof repost.intervalHours === "number" && typeof repost.maxResurfaces === "number"
      ? {
          intervalHours: repost.intervalHours,
          maxResurfaces: repost.maxResurfaces,
          plugComment: typeof repost.plugComment === "string" ? repost.plugComment : "",
        }
      : null;
  const autoPlug: AutoPlugConfig | null =
    plug &&
    (plug.metricType === "likes" || plug.metricType === "retweets") &&
    typeof plug.threshold === "number"
      ? {
          metricType: plug.metricType,
          threshold: plug.threshold,
          plugComment: typeof plug.plugComment === "string" ? plug.plugComment : "",
        }
      : null;

  const youtube = asRecord(meta.youtube);
  // One reel config in the composer: take the first selected account's.
  const igMeta = asRecord(meta.instagram) ?? {};
  const igSaved = accountIds.map((id) => asRecord(igMeta[id])).find((r) => r != null) ?? null;
  const coverImageUrl =
    typeof igSaved?.coverImageUrl === "string" && igSaved.coverImageUrl.trim()
      ? igSaved.coverImageUrl.trim()
      : undefined;
  const scheduledAt =
    opts.keepSchedule && post.scheduledAt ? new Date(post.scheduledAt).toISOString() : null;
  const ct = meta.contentType;

  return {
    ...base,
    parts,
    accountIds,
    captionOverrides,
    ...(Object.keys(perAccount).length > 0 ? { accountCaptions: perAccount } : {}),
    tiktok,
    pinterest,
    x: {
      madeWithAi: x?.madeWithAi === true,
      paidPartnership: x?.paidPartnership === true,
    },
    youtubeTitle: typeof youtube?.title === "string" ? youtube.title.slice(0, 100) : "",
    instagram: {
      ...(coverImageUrl ? { coverImageUrl } : {}),
      isTrialReel: igSaved?.isTrialReel === true,
    },
    tiktokAutoAddMusic: meta.tiktokAutoAddMusic !== false,
    autoRepost,
    autoPlug,
    scheduledAt,
    queueSlotId: scheduledAt ? (post.queueSlotId ?? null) : null,
    initialContentType:
      ct === "text" || ct === "image" || ct === "video" || ct === "threads" || ct === "collection"
        ? ct
        : null,
  };
}

/** Saved Pinterest default boards (`platformMetadata.pinterestDefaultBoardId`). */
export function withPinterestDefaults(
  draft: ComposerDraft,
  accounts: readonly ComposerAccount[],
): Record<string, PinterestPostSettings> {
  let next = draft.pinterest;
  for (const acc of accounts) {
    if (acc.platform !== "pinterest") continue;
    const id = acc.platformMetadata?.pinterestDefaultBoardId;
    const boardId = typeof id === "string" ? id.trim() : "";
    if (!boardId || next[acc.id]?.boardId) continue;
    next = {
      ...next,
      [acc.id]: {
        boardId,
        title: next[acc.id]?.title ?? "",
        link: next[acc.id]?.link ?? "",
        rememberBoard: next[acc.id]?.rememberBoard ?? false,
        rememberLink: next[acc.id]?.rememberLink ?? false,
      },
    };
  }
  return next;
}
