/**
 * Live per-publication metrics from each platform.
 * Failures degrade to status + error — never throw past the dispatcher.
 */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";
import { jsonGet } from "../http-json.js";
import { calendarDayKey } from "../date-window.js";
import { blueskySession, blueskySessionAfter401 } from "../inbox/bluesky-session.js";
import type { MetricMap } from "./types.js";
import {
  firstTikTokPublicVideoId,
  isTikTokApiOk,
  isTikTokVideoId,
  parseTikTokJson,
  tiktokPublishIdFromStored,
} from "../tiktok-post-id.js";

export type PlatformFetchInput = {
  platform: string;
  platformPostId: string;
  platformUserId: string;
  accessToken: string;
  accessSecret?: string | null;
  /** Granted OAuth scopes string from connected_accounts.scopes */
  scopes?: string | null;
  platformAccountType?: string | null;
  since?: Date;
  until?: Date;
  timeZone?: string;
  accountId?: string;
  accountHandle?: string | null;
};

export type PlatformFetchResult = {
  metrics: MetricMap;
  status: "ok" | "scope_missing" | "unsupported" | "error";
  error?: string;
  missingScopes?: string[];
  /** When a publish_id was resolved to a real platform id (TikTok). */
  resolvedPlatformPostId?: string;
};

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function setMetric(
  metrics: MetricMap,
  key: keyof MetricMap,
  value: number | undefined,
): void {
  if (value != null) metrics[key] = value;
}

function hasDefinedMetrics(metrics: MetricMap): boolean {
  return Object.values(metrics).some((v) => v != null);
}

function pick(...vals: Array<number | undefined>): number | undefined {
  for (const v of vals) {
    if (typeof v === "number") return v;
  }
  return undefined;
}

function scopeError(
  missingScopes: string[],
  message: string,
): PlatformFetchResult {
  return {
    metrics: {},
    status: "scope_missing",
    error: message,
    missingScopes,
  };
}

function errResult(message: string): PlatformFetchResult {
  return { metrics: {}, status: "error", error: message };
}

async function fetchTwitter(
  input: PlatformFetchInput,
): Promise<PlatformFetchResult> {
  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;
  if (!appKey || !appSecret || !input.accessSecret) {
    return errResult("Twitter credentials incomplete. Reconnect the X account.");
  }
  try {
    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken: input.accessToken,
      accessSecret: input.accessSecret,
    });
    const tweet = await client.v2.singleTweet(input.platformPostId, {
      "tweet.fields": ["public_metrics"],
    });
    const m = tweet.data?.public_metrics;
    if (!m) return errResult("No public metrics returned for this tweet.");
    return {
      status: "ok",
      metrics: {
        likes: m.like_count,
        reposts: m.retweet_count,
        comments: m.reply_count,
        quotes: m.quote_count,
        impressions: m.impression_count,
        views: m.impression_count,
      },
    };
  } catch (e) {
    return errResult(e instanceof Error ? e.message : "Twitter metrics failed");
  }
}

async function fetchYouTube(
  input: PlatformFetchInput,
): Promise<PlatformFetchResult> {
  // youtube.readonly (already requested) is enough for video statistics.
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", input.platformPostId);
  const { ok, data } = await jsonGet(url.toString(), {
    Authorization: `Bearer ${input.accessToken}`,
  });
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "YouTube videos.list failed";
    if (/insufficient|scope|permission/i.test(msg)) {
      return scopeError(
        ["https://www.googleapis.com/auth/youtube.readonly"],
        msg,
      );
    }
    return errResult(msg);
  }
  const item = (data as { items?: Array<{ statistics?: Record<string, string> }> })
    ?.items?.[0];
  if (!item?.statistics) return errResult("Video not found or no statistics.");
  const s = item.statistics;
  return {
    status: "ok",
    metrics: {
      views: num(s.viewCount),
      likes: num(s.likeCount),
      comments: num(s.commentCount),
    },
  };
}

async function facebookInsightsId(
  storedId: string,
  pageId: string,
  accessToken: string,
): Promise<string> {
  if (storedId.includes("_")) return storedId;
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(storedId)}?fields=page_story_id&access_token=${encodeURIComponent(accessToken)}`;
  const { ok, data } = await jsonGet(url);
  const story = (data as { page_story_id?: string } | undefined)?.page_story_id;
  if (ok && story) return story;
  return pageId ? `${pageId}_${storedId}` : storedId;
}

async function fetchFacebook(
  input: PlatformFetchInput,
): Promise<PlatformFetchResult> {
  const insightId = await facebookInsightsId(
    input.platformPostId,
    input.platformUserId,
    input.accessToken,
  );
  const id = encodeURIComponent(insightId);
  const base = `https://graph.facebook.com/v21.0/${id}`;
  const fieldsUrl = `${base}?fields=shares,likes.summary(true),comments.summary(true)&access_token=${encodeURIComponent(input.accessToken)}`;
  const fields = await jsonGet(fieldsUrl);
  const metrics: MetricMap = {};
  if (fields.ok) {
    const d = fields.data as {
      shares?: { count?: number };
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    };
    setMetric(metrics, "shares", num(d.shares?.count));
    setMetric(metrics, "likes", num(d.likes?.summary?.total_count));
    setMetric(metrics, "comments", num(d.comments?.summary?.total_count));
  }

  const insightsUrl = `${base}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_clicks&access_token=${encodeURIComponent(input.accessToken)}`;
  const insights = await jsonGet(insightsUrl);
  if (insights.ok) {
    const rows = (insights.data as { data?: Array<{ name?: string; values?: Array<{ value?: number }> }> })
      ?.data;
    for (const row of rows ?? []) {
      const v = num(row.values?.[0]?.value);
      if (v == null) continue;
      if (row.name === "post_impressions") {
        metrics.impressions = v;
        metrics.views = pick(metrics.views, v);
      } else if (row.name === "post_impressions_unique") {
        metrics.reach = v;
      } else if (row.name === "post_clicks") {
        metrics.clicks = v;
      }
    }
  } else {
    const msg =
      (insights.data as { error?: { message?: string; code?: number } })?.error
        ?.message ?? "";
    if (/insight|permission|(#10)|(#200)|read_insights/i.test(msg)) {
      // Still return engagement if we got likes/comments
      if (Object.keys(metrics).length > 0 && hasDefinedMetrics(metrics)) {
        return {
          status: "ok",
          metrics,
          error: "Insights limited — reconnect with read_insights for full Page insights.",
          missingScopes: ["read_insights"],
        };
      }
      return scopeError(["read_insights"], msg || "Facebook insights require read_insights.");
    }
  }

  if (!hasDefinedMetrics(metrics)) {
    return errResult(
      (fields.data as { error?: { message?: string } })?.error?.message ??
        "No Facebook metrics available.",
    );
  }
  return { status: "ok", metrics };
}

async function fetchInstagram(
  input: PlatformFetchInput,
): Promise<PlatformFetchResult> {
  const id = encodeURIComponent(input.platformPostId);
  const base = `https://graph.instagram.com/v21.0/${id}`;
  const mediaUrl = `${base}?fields=like_count,comments_count,media_type,timestamp&access_token=${encodeURIComponent(input.accessToken)}`;
  const media = await jsonGet(mediaUrl);
  const metrics: MetricMap = {};
  if (media.ok) {
    const d = media.data as {
      like_count?: number;
      comments_count?: number;
    };
    setMetric(metrics, "likes", num(d.like_count));
    setMetric(metrics, "comments", num(d.comments_count));
  }

  const insightsUrl = `${base}/insights?metric=views,reach,total_interactions,saved,shares&access_token=${encodeURIComponent(input.accessToken)}`;
  const insights = await jsonGet(insightsUrl);
  if (insights.ok) {
    const rows = (insights.data as { data?: Array<{ name?: string; values?: Array<{ value?: number }> }> })
      ?.data;
    for (const row of rows ?? []) {
      const v = num(row.values?.[0]?.value);
      if (v == null) continue;
      if (row.name === "views") metrics.views = v;
      else if (row.name === "reach") metrics.reach = v;
      else if (row.name === "saved") metrics.saves = v;
      else if (row.name === "shares") metrics.shares = v;
      else if (row.name === "total_interactions") {
        // leave as engagement signal via components
      }
    }
  } else {
    const msg =
      (insights.data as { error?: { message?: string } })?.error?.message ?? "";
    if (/insight|permission|manage_insights/i.test(msg)) {
      if (Object.keys(metrics).length > 0 && hasDefinedMetrics(metrics)) {
        return {
          status: "ok",
          metrics,
          error:
            "Reconnect Instagram with instagram_business_manage_insights for views/reach.",
          missingScopes: ["instagram_business_manage_insights"],
        };
      }
      return scopeError(
        ["instagram_business_manage_insights"],
        msg || "Instagram insights scope required.",
      );
    }
  }

  if (!hasDefinedMetrics(metrics)) {
    return errResult(
      (media.data as { error?: { message?: string } })?.error?.message ??
        "No Instagram metrics available.",
    );
  }
  return { status: "ok", metrics };
}

async function fetchThreads(
  input: PlatformFetchInput,
): Promise<PlatformFetchResult> {
  const id = encodeURIComponent(input.platformPostId);
  const url = `https://graph.threads.net/v1.0/${id}/insights?metric=views,likes,replies,reposts,quotes&access_token=${encodeURIComponent(input.accessToken)}`;
  const { ok, data } = await jsonGet(url);
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "Threads insights failed";
    if (/insight|permission|threads_manage_insights/i.test(msg)) {
      return scopeError(["threads_manage_insights"], msg);
    }
    return errResult(msg);
  }
  const metrics: MetricMap = {};
  const rows = (data as { data?: Array<{ name?: string; values?: Array<{ value?: number }> }> })
    ?.data;
  for (const row of rows ?? []) {
    const v = num(row.values?.[0]?.value);
    if (v == null) continue;
    if (row.name === "views") metrics.views = v;
    else if (row.name === "likes") metrics.likes = v;
    else if (row.name === "replies") metrics.comments = v;
    else if (row.name === "reposts") metrics.reposts = v;
    else if (row.name === "quotes") metrics.quotes = v;
  }
  if (!hasDefinedMetrics(metrics)) {
    return errResult("No Threads insights returned.");
  }
  return { status: "ok", metrics };
}

async function resolveTikTokVideoId(
  storedId: string,
  accessToken: string,
): Promise<{ videoId: string } | { pending: true } | { error: string }> {
  if (isTikTokVideoId(storedId)) return { videoId: storedId };
  const publishId = tiktokPublishIdFromStored(storedId);
  if (!publishId) return { pending: true };
  const res = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
    },
  );
  const text = await res.text();
  let data: {
    data?: { publicaly_available_post_id?: unknown };
    error?: { code?: string; message?: string };
  } = {};
  try {
    data = parseTikTokJson(text) as typeof data;
  } catch {
    return { error: "TikTok publish status returned invalid JSON" };
  }
  if (!isTikTokApiOk(data, res.ok)) {
    const code = data.error?.code ? ` (${data.error.code})` : "";
    return {
      error:
        data.error?.message ??
        `TikTok publish status failed${code || ` (${res.status})`}`,
    };
  }
  const videoId = firstTikTokPublicVideoId(data.data?.publicaly_available_post_id);
  if (!videoId) return { pending: true };
  return { videoId };
}

async function fetchTikTok(
  input: PlatformFetchInput,
): Promise<PlatformFetchResult> {
  const resolved = await resolveTikTokVideoId(
    input.platformPostId,
    input.accessToken,
  );
  if ("error" in resolved) return errResult(resolved.error);
  if ("pending" in resolved) {
    return {
      metrics: {},
      status: "error",
      error:
        "TikTok has not issued a public video id yet. Sandbox and private posts often stay in inbox until the app is approved and the post is public.",
    };
  }
  const videoId = resolved.videoId;

  const url =
    "https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filters: { video_ids: [videoId] },
    }),
  });
  const text = await res.text();
  let data: {
    error?: { code?: string; message?: string };
    data?: { videos?: Array<Record<string, unknown>> };
  } = {};
  try {
    data = parseTikTokJson(text) as typeof data;
  } catch {
    return errResult("TikTok video.query returned invalid JSON");
  }
  if (!isTikTokApiOk(data, res.ok)) {
    const msg = data.error?.message ?? "TikTok video.query failed";
    if (/scope|permission|video\.list/i.test(msg) || data.error?.code === "scope_not_authorized") {
      return scopeError(["video.list"], msg);
    }
    return errResult(msg);
  }
  const video = data.data?.videos?.[0];
  if (!video) return errResult("TikTok video not found in query response.");
  return {
    status: "ok",
    metrics: {
      likes: num(video.like_count),
      comments: num(video.comment_count),
      shares: num(video.share_count),
      views: num(video.view_count),
    },
    resolvedPlatformPostId:
      videoId !== input.platformPostId ? videoId : undefined,
  };
}

async function fetchPinterest(
  input: PlatformFetchInput,
): Promise<PlatformFetchResult> {
  const PINTEREST_MAX_MS = 90 * 24 * 60 * 60 * 1000;
  const tz = input.timeZone ?? "UTC";
  const nowKey = calendarDayKey(new Date(), tz);
  let end = input.until ?? new Date();
  let endKey = calendarDayKey(end, tz);
  if (endKey > nowKey) {
    end = new Date();
    endKey = nowKey;
  }
  let start = input.since ?? new Date(end.getTime() - PINTEREST_MAX_MS);
  if (end.getTime() - start.getTime() > PINTEREST_MAX_MS) {
    start = new Date(end.getTime() - PINTEREST_MAX_MS);
  }
  const fmt = (d: Date) => calendarDayKey(d, tz);
  const url = new URL(
    `https://api.pinterest.com/v5/pins/${encodeURIComponent(input.platformPostId)}/analytics`,
  );
  url.searchParams.set("start_date", fmt(start));
  url.searchParams.set("end_date", fmt(end));
  url.searchParams.set("metric_types", "IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE");
  const { ok, data, status } = await jsonGet(url.toString(), {
    Authorization: `Bearer ${input.accessToken}`,
  });
  if (!ok) {
    const msg =
      (data as { message?: string; error?: { message?: string } })?.message ??
      (data as { error?: { message?: string } })?.error?.message ??
      `Pinterest analytics failed (${status})`;
    return errResult(msg);
  }
  // Response shape: { all: { summary_metrics: { IMPRESSION: n, ... } } } or daily series
  const summary =
    (data as { all?: { summary_metrics?: Record<string, number> } })?.all
      ?.summary_metrics ??
    (data as { summary_metrics?: Record<string, number> })?.summary_metrics ??
    {};
  return {
    status: "ok",
    metrics: {
      impressions: num(summary.IMPRESSION),
      views: num(summary.IMPRESSION),
      clicks: pick(num(summary.PIN_CLICK), num(summary.OUTBOUND_CLICK)),
      saves: num(summary.SAVE),
    },
  };
}

async function fetchLinkedIn(
  input: PlatformFetchInput,
): Promise<PlatformFetchResult> {
  // Best-effort: social metadata on UGC/share. Full org analytics need MDP products.
  const urn = input.platformPostId.includes("urn:")
    ? input.platformPostId
    : `urn:li:share:${input.platformPostId}`;
  const encoded = encodeURIComponent(urn);
  const url = `https://api.linkedin.com/rest/socialActions/${encoded}`;
  const { ok, data, status } = await jsonGet(url, {
    Authorization: `Bearer ${input.accessToken}`,
    "LinkedIn-Version": "202411",
    "X-Restli-Protocol-Version": "2.0.0",
  });
  if (!ok) {
    const msg =
      (data as { message?: string })?.message ??
      `LinkedIn socialActions failed (${status})`;
    if (/403|permission|SCOPE|unauthorized/i.test(msg) || status === 403) {
      return {
        metrics: {},
        status: "unsupported",
        error:
          "LinkedIn organic analytics need Marketing Developer Platform / Community Management products. Posting still works.",
      };
    }
    return errResult(msg);
  }
  const d = data as {
    likesSummary?: { totalLikes?: number };
    commentsSummary?: { totalFirstLevelComments?: number };
    reactionSummaries?: Array<{ count?: number }>;
  };
  const reactionSum = (d.reactionSummaries ?? []).reduce(
    (acc, r) => acc + (num(r.count) ?? 0),
    0,
  );
  return {
    status: "ok",
    metrics: {
      likes: pick(num(d.likesSummary?.totalLikes), reactionSum || undefined),
      comments: num(d.commentsSummary?.totalFirstLevelComments),
    },
  };
}

async function fetchBluesky(
  input: PlatformFetchInput,
): Promise<PlatformFetchResult> {
  const handle = input.accountHandle?.replace(/^@/, "") ?? "";
  if (!input.accountId || !handle || !input.accessSecret) {
    return errResult("Bluesky credentials incomplete. Reconnect the account.");
  }
  let session = await blueskySession(
    input.accountId,
    handle,
    input.accessSecret,
  );
  if (!session) {
    return errResult("Bluesky login failed. Reconnect the account.");
  }
  const url = new URL("https://bsky.social/xrpc/app.bsky.feed.getPosts");
  url.searchParams.set("uris", input.platformPostId);
  let { ok, data, status } = await jsonGet(url.toString(), {
    Authorization: `Bearer ${session.accessJwt}`,
  });
  if (status === 401) {
    session = await blueskySessionAfter401(
      input.accountId,
      handle,
      input.accessSecret,
    );
    if (!session) {
      return errResult("Bluesky login failed. Reconnect the account.");
    }
    const retry = await jsonGet(url.toString(), {
      Authorization: `Bearer ${session.accessJwt}`,
    });
    ok = retry.ok;
    data = retry.data;
  }
  if (!ok) {
    return errResult(
      (data as { message?: string })?.message ?? "Bluesky getPosts failed",
    );
  }
  const post = (data as { posts?: Array<{ likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number }> })
    ?.posts?.[0];
  if (!post) return errResult("Bluesky post not found.");
  return {
    status: "ok",
    metrics: {
      likes: num(post.likeCount),
      reposts: num(post.repostCount),
      comments: num(post.replyCount),
      quotes: num(post.quoteCount),
    },
  };
}

export async function fetchPlatformPublicationMetrics(
  input: PlatformFetchInput,
): Promise<PlatformFetchResult> {
  switch (input.platform) {
    case "twitter_x":
      return fetchTwitter(input);
    case "youtube":
      return fetchYouTube(input);
    case "facebook":
      return fetchFacebook(input);
    case "instagram":
      return fetchInstagram(input);
    case "threads":
      return fetchThreads(input);
    case "tiktok":
      return fetchTikTok(input);
    case "pinterest":
      return fetchPinterest(input);
    case "linkedin":
      return fetchLinkedIn(input);
    case "bluesky":
      return fetchBluesky(input);
    default:
      return {
        metrics: {},
        status: "unsupported",
        error: `Analytics not supported for ${input.platform}`,
      };
  }
}
