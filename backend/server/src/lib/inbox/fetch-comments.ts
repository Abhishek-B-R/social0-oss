/**
 * Live comment fetchers. Failures degrade - never throw past the dispatcher.
 */

import { TwitterApi, type TweetV2 } from "twitter-api-v2";
import { env } from "../env.js";
import { extractHttpStatus } from "../twitter-errors.js";
import { jsonGet } from "../http-json.js";
import type { InboxComment } from "./types.js";
import {
  INBOX_REQUIRED_SCOPES,
  sameInboxHandle,
  sameLinkedInActor,
  youtubeAuthorChannelId,
} from "./types.js";
import { isGonePlatformPost } from "./fetch-errors.js";
import { nestMentionReplies } from "./mention-nest.js";
import { blueskySession, blueskySessionAfter401 } from "./bluesky-session.js";
import {
  parseBskyViewEmbed,
  parseFbCommentAttachment,
  withMediaFallback,
  xMediaToAttachment,
  type XMediaLike,
} from "./parse-attachment.js";

export type CommentFetchInput = {
  platform: string;
  platformPostId: string;
  platformPostUrl: string | null;
  platformUserId: string;
  accessToken: string;
  accessSecret?: string | null;
  accountId: string;
  accountLabel: string | null;
  postId: string;
  publicationId: string;
  postSnippet: string;
  postContent: string;
  postMediaUrl?: string | null;
  postPublishedAt?: string | null;
  postAccountImageUrl?: string | null;
  /** ISO time - stop paging comments older than this (newest-first). */
  since?: string | null;
  /** Graph paging depth (default 3). Verify passes INBOX_MAX_PAGES. */
  maxGraphPages?: number;
};

function graphPagesCap(input: CommentFetchInput): number {
  return input.maxGraphPages ?? 3;
}

export type CommentFetchResult = {
  comments: InboxComment[];
  status: "ok" | "scope_missing" | "unsupported" | "error";
  error?: string;
  missingScopes?: string[];
};

function base(input: CommentFetchInput): Omit<
  InboxComment,
  "id" | "authorName" | "authorHandle" | "text" | "createdAt" | "parentId" | "likeCount" | "likedByMe" | "isOwn"
> {
  return {
    platform: input.platform,
    accountId: input.accountId,
    accountLabel: input.accountLabel,
    postId: input.postId,
    publicationId: input.publicationId,
    platformPostId: input.platformPostId,
    platformPostUrl: input.platformPostUrl,
    postSnippet: input.postSnippet,
    postContent: input.postContent,
    postMediaUrl: input.postMediaUrl ?? null,
    postPublishedAt: input.postPublishedAt ?? null,
    postAccountImageUrl: input.postAccountImageUrl ?? null,
    canReply: true,
  };
}

function withAuthor(
  input: CommentFetchInput,
  authorHandle: string | null,
): { isOwn: boolean } {
  return { isOwn: sameInboxHandle(authorHandle, input.accountLabel) };
}

function err(
  message: string,
  missingScopes?: string[],
): CommentFetchResult {
  return {
    comments: [],
    status: missingScopes?.length ? "scope_missing" : "error",
    error: message,
    missingScopes,
  };
}

type GraphPage = {
  data?: Array<Record<string, unknown>>;
  paging?: { next?: string };
};

async function restOfGraphPages(
  first: GraphPage,
  sinceMs: number | null,
  timeField: string,
  cap = 3,
): Promise<Array<Record<string, unknown>>> {
  const out = [...(first.data ?? [])];
  let next = first.paging?.next ?? null;
  for (let page = 1; next && page < cap; page++) {
    const oldest = out.length
      ? Date.parse(String(out[out.length - 1]?.[timeField] ?? ""))
      : 0;
    if (sinceMs != null && oldest && oldest < sinceMs) break;
    const pageRes = await jsonGet(next);
    if (!pageRes.ok) break;
    const body = pageRes.data as GraphPage;
    out.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
  }
  return out;
}

async function fetchFacebook(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const token = encodeURIComponent(input.accessToken);
  const id = encodeURIComponent(input.platformPostId);
  const sinceMs = input.since ? Date.parse(input.since) : null;
  const fields =
    "id,from,message,created_time,like_count,user_likes,attachment,comments.limit(25){id,from,message,created_time,like_count,user_likes,attachment}";
  const startUrl = `https://graph.facebook.com/v21.0/${id}/comments?fields=${fields}&limit=25&order=reverse_chronological&access_token=${token}`;
  const { ok, data } = await jsonGet(startUrl);
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "Facebook comments failed";
    if (/permission|#200|#10|manage_engagement/i.test(msg)) {
      return err(msg, ["pages_manage_engagement"]);
    }
    return err(msg);
  }

  const pageCap = graphPagesCap(input);
  const rows = await restOfGraphPages(
    data as GraphPage,
    sinceMs,
    "created_time",
    pageCap,
  );
  const comments: InboxComment[] = [];
  const common = base(input);

  const mapRow = (
    row: Record<string, unknown>,
    parentId: string | null,
  ): InboxComment => {
    const from = row.from as { name?: string; id?: string } | undefined;
    const media = withMediaFallback(
      String(row.message ?? ""),
      parseFbCommentAttachment(row.attachment),
    );
    return {
      ...common,
      id: String(row.id ?? ""),
      authorName: from?.name ?? "Facebook user",
      authorHandle: from?.id ?? null,
      text: media.text,
      attachment: media.attachment,
      createdAt: typeof row.created_time === "string" ? row.created_time : null,
      likeCount:
        typeof row.like_count === "number" ? row.like_count : undefined,
      likedByMe: typeof row.user_likes === "boolean" ? row.user_likes : undefined,
      parentId,
      isOwn: Boolean(from?.id && from.id === input.platformUserId),
    };
  };

  for (const row of rows) {
    comments.push(mapRow(row, null));
    const nestedObj = row.comments as GraphPage | undefined;
    let nested = [...(nestedObj?.data ?? [])];
    if (nestedObj?.paging?.next || nested.length >= 25) {
      const nestedUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(String(row.id ?? ""))}/comments?fields=id,from,message,created_time,like_count,user_likes,attachment&limit=50&order=reverse_chronological&access_token=${token}`;
      const nestedRes = await jsonGet(nestedUrl);
      if (nestedRes.ok) {
        nested = await restOfGraphPages(
          nestedRes.data as GraphPage,
          sinceMs,
          "created_time",
          pageCap,
        );
      }
    }
    for (const child of nested) {
      comments.push(mapRow(child, String(row.id ?? "")));
    }
  }
  return { comments, status: "ok" };
}

async function fetchInstagram(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const token = encodeURIComponent(input.accessToken);
  const id = encodeURIComponent(input.platformPostId);
  const sinceMs = input.since ? Date.parse(input.since) : null;
  const url = `https://graph.instagram.com/v21.0/${id}/comments?fields=id,text,username,timestamp,like_count,user_likes,replies.limit(50){id,text,username,timestamp,like_count,user_likes}&limit=50&access_token=${token}`;
  const { ok, data } = await jsonGet(url);
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "Instagram comments failed";
    if (/permission|manage_comments/i.test(msg)) {
      return err(msg, ["instagram_business_manage_comments"]);
    }
    return err(msg);
  }
  const pageCap = graphPagesCap(input);
  const rows = await restOfGraphPages(
    data as GraphPage,
    sinceMs,
    "timestamp",
    pageCap,
  );
  const comments: InboxComment[] = [];
  const common = base(input);

  const mapIg = (
    row: Record<string, unknown>,
    parentId: string | null,
  ): InboxComment => {
    const handle = typeof row.username === "string" ? row.username : null;
    return {
      ...common,
      id: String(row.id ?? ""),
      authorName: handle ?? "Instagram user",
      authorHandle: handle,
      text: String(row.text ?? ""),
      createdAt: typeof row.timestamp === "string" ? row.timestamp : null,
      likeCount:
        typeof row.like_count === "number" ? row.like_count : undefined,
      likedByMe: typeof row.user_likes === "boolean" ? row.user_likes : undefined,
      parentId,
      ...withAuthor(input, handle),
    };
  };

  for (const row of rows) {
    comments.push(mapIg(row, null));
    const nestedObj = row.replies as GraphPage | undefined;
    let nested = [...(nestedObj?.data ?? [])];
    if (nestedObj?.paging?.next || nested.length >= 50) {
      const nestedUrl = `https://graph.instagram.com/v21.0/${encodeURIComponent(String(row.id ?? ""))}/replies?fields=id,text,username,timestamp,like_count,user_likes&limit=50&access_token=${token}`;
      const nestedRes = await jsonGet(nestedUrl);
      if (nestedRes.ok) {
        nested = await restOfGraphPages(
          nestedRes.data as GraphPage,
          sinceMs,
          "timestamp",
          pageCap,
        );
      }
    }
    for (const child of nested) {
      comments.push(mapIg(child, String(row.id ?? "")));
    }
  }
  return { comments, status: "ok" };
}

async function fetchThreads(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const id = encodeURIComponent(input.platformPostId);
  const token = encodeURIComponent(input.accessToken);
  const convoUrl = `https://graph.threads.net/v1.0/${id}/conversation?fields=id,text,username,timestamp,like_count,replied_to{id}&limit=50&access_token=${token}`;
  let { ok, data } = await jsonGet(convoUrl);
  if (!ok) {
    const fallback = `https://graph.threads.net/v1.0/${id}/replies?fields=id,text,username,timestamp,like_count,replied_to{id}&limit=25&access_token=${token}`;
    const retry = await jsonGet(fallback);
    ok = retry.ok;
    data = retry.data;
  }
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "Threads replies failed";
    if (/permission|manage_replies/i.test(msg)) {
      return err(msg, ["threads_manage_replies"]);
    }
    return err(msg);
  }
  const sinceMs = input.since ? Date.parse(input.since) : null;
  const rows = await restOfGraphPages(
    data as GraphPage,
    sinceMs,
    "timestamp",
    graphPagesCap(input),
  );
  const common = base(input);
  const comments: InboxComment[] = rows.map((row) => {
    const handle = typeof row.username === "string" ? row.username : null;
    const repliedTo = (row.replied_to as { id?: string } | undefined)?.id;
    const parentId =
      !repliedTo || repliedTo === input.platformPostId ? null : repliedTo;
    return {
      ...common,
      id: String(row.id ?? ""),
      authorName: handle ?? "Threads user",
      authorHandle: handle,
      text: String(row.text ?? ""),
      createdAt: typeof row.timestamp === "string" ? row.timestamp : null,
      likeCount:
        typeof row.like_count === "number" ? row.like_count : undefined,
      parentId,
      ...withAuthor(input, handle),
    };
  });
  return { comments, status: "ok" };
}

function youtubeHandle(sn: Record<string, unknown>): string | null {
  const name = String(sn.authorDisplayName ?? "").trim();
  if (!name) return null;
  return name.replace(/^@/, "");
}

async function fetchYoutubeReplies(
  parentId: string,
  accessToken: string,
): Promise<Array<{ id: string; snippet: Record<string, unknown> }>> {
  const out: Array<{ id: string; snippet: Record<string, unknown> }> = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 2; i++) {
    const url = new URL("https://www.googleapis.com/youtube/v3/comments");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("parentId", parentId);
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("textFormat", "plainText");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const { ok, data } = await jsonGet(url.toString(), {
      Authorization: `Bearer ${accessToken}`,
    });
    if (!ok) break;
    const items =
      (data as { items?: Array<{ id?: string; snippet?: Record<string, unknown> }>; nextPageToken?: string })
        ?.items ?? [];
    for (const item of items) {
      if (item.id && item.snippet) out.push({ id: item.id, snippet: item.snippet });
    }
    pageToken = (data as { nextPageToken?: string }).nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

async function fetchYouTube(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const sinceMs = input.since ? Date.parse(input.since) : null;
  const comments: InboxComment[] = [];
  const common = base(input);
  let pageToken: string | undefined;
  let first = true;
  for (let page = 0; page < 2; page++) {
    const url = new URL(
      "https://www.googleapis.com/youtube/v3/commentThreads",
    );
    url.searchParams.set("part", "snippet,replies");
    url.searchParams.set("videoId", input.platformPostId);
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("textFormat", "plainText");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const { ok, data, status } = await jsonGet(url.toString(), {
      Authorization: `Bearer ${input.accessToken}`,
    });
    if (!ok) {
      const msg =
        (data as { error?: { message?: string } })?.error?.message ??
        "YouTube comments failed";
      if (first && /disabled|commentsDisabled/i.test(msg)) {
        return { comments: [], status: "ok" };
      }
      if (first && (status === 404 || isGonePlatformPost(msg))) {
        return { comments: [], status: "ok" };
      }
      if (first && (status === 403 || /forbidden|insufficient|permission/i.test(msg))) {
        return err(msg, INBOX_REQUIRED_SCOPES.youtube);
      }
      if (first) return err(msg);
      break;
    }
    first = false;
    const items =
      (data as { items?: Array<Record<string, unknown>>; nextPageToken?: string })
        ?.items ?? [];
    let hitSince = false;
    for (const item of items) {
      const top = (item.snippet as { topLevelComment?: { id?: string; snippet?: Record<string, unknown> }; totalReplyCount?: number })
        ?.topLevelComment;
      const sn = top?.snippet;
      if (!top?.id || !sn) continue;
      const topId = top.id;
      const publishedAt =
        typeof sn.publishedAt === "string" ? Date.parse(sn.publishedAt) : NaN;
      if (sinceMs != null && publishedAt && publishedAt < sinceMs) {
        hitSince = true;
        continue;
      }
      comments.push({
        ...common,
        id: top.id,
        authorName: String(sn.authorDisplayName ?? "YouTube user"),
        authorHandle: youtubeHandle(sn),
        text: String(sn.textDisplay ?? sn.textOriginal ?? ""),
        createdAt: typeof sn.publishedAt === "string" ? sn.publishedAt : null,
        likeCount: typeof sn.likeCount === "number" ? sn.likeCount : undefined,
        likedByMe: sn.viewerRating === "like",
        parentId: null,
        isOwn: youtubeAuthorChannelId(sn.authorChannelId) === input.platformUserId,
      });
      const embedded =
        (item.replies as { comments?: Array<{ id?: string; snippet?: Record<string, unknown> }> })
          ?.comments ?? [];
      const totalReplyCount =
        typeof (item.snippet as { totalReplyCount?: number })?.totalReplyCount === "number"
          ? (item.snippet as { totalReplyCount: number }).totalReplyCount
          : embedded.length;
      const replies =
        totalReplyCount > embedded.length && comments.length < 40
          ? await fetchYoutubeReplies(top.id, input.accessToken)
          : embedded.filter((r): r is { id: string; snippet: Record<string, unknown> } =>
              Boolean(r.id && r.snippet),
            );
      type YoutubeNestRow = {
        id: string;
        parentId: string | null;
        text: string;
        authorHandle: string | null;
        authorName: string;
        createdAt: string | null;
        isOwn: boolean;
        likeCount: number | undefined;
        likedByMe?: boolean;
      };
      const replyComments = nestMentionReplies<YoutubeNestRow>(
        {
          id: topId,
          parentId: null,
          text: String(sn.textDisplay ?? sn.textOriginal ?? ""),
          authorHandle: youtubeHandle(sn),
          authorName: String(sn.authorDisplayName ?? "YouTube user"),
          createdAt: typeof sn.publishedAt === "string" ? sn.publishedAt : null,
          isOwn: youtubeAuthorChannelId(sn.authorChannelId) === input.platformUserId,
          likeCount: typeof sn.likeCount === "number" ? sn.likeCount : undefined,
          likedByMe: sn.viewerRating === "like",
        },
        replies.map((r) => {
          const rs = r.snippet;
          return {
            id: r.id,
            parentId: topId,
            text: String(rs.textDisplay ?? rs.textOriginal ?? ""),
            authorHandle: youtubeHandle(rs),
            authorName: String(rs.authorDisplayName ?? "YouTube user"),
            createdAt: typeof rs.publishedAt === "string" ? rs.publishedAt : null,
            isOwn: youtubeAuthorChannelId(rs.authorChannelId) === input.platformUserId,
            likeCount: typeof rs.likeCount === "number" ? rs.likeCount : undefined,
            likedByMe: rs.viewerRating === "like",
          };
        }),
      );
      for (const r of replyComments) {
        comments.push({
          ...common,
          id: r.id,
          authorName: r.authorName,
          authorHandle: r.authorHandle,
          text: r.text,
          createdAt: r.createdAt,
          parentId: r.parentId,
          likeCount: r.likeCount,
          likedByMe: r.likedByMe,
          isOwn: r.isOwn,
        });
      }
    }
    pageToken = (data as { nextPageToken?: string }).nextPageToken;
    if (!pageToken || hitSince) break;
  }
  return { comments, status: "ok" };
}

/** Recent Search allows 512-char queries; leave headroom for safety. */
const X_QUERY_MAX_CHARS = 480;
const X_SEARCH_PAGE_CAP = 5;

function tweetsToComments(
  input: CommentFetchInput,
  tweets: TweetV2[],
  users: Map<string, { name?: string; username?: string }>,
  mediaByKey: Map<string, XMediaLike>,
): InboxComment[] {
  const common = base(input);
  const comments: InboxComment[] = [];
  const seen = new Set<string>();
  const repliedToOf = new Map<string, string | undefined>();
  const authorOf = new Map<string, string | undefined>();
  for (const tweet of tweets) {
    if (!tweet.id) continue;
    const repliedTo = tweet.referenced_tweets?.find(
      (r) => r.type === "replied_to",
    )?.id;
    repliedToOf.set(tweet.id, repliedTo);
    authorOf.set(tweet.id, tweet.author_id);
  }
  const ownSelfThread = (tweetId: string): boolean => {
    let id: string | undefined = repliedToOf.get(tweetId);
    const walked = new Set<string>();
    while (id && !walked.has(id)) {
      walked.add(id);
      if (id === input.platformPostId) return true;
      if (authorOf.get(id) !== input.platformUserId) return false;
      id = repliedToOf.get(id);
    }
    return false;
  };
  for (const tweet of tweets) {
    if (!tweet.id || seen.has(tweet.id)) continue;
    seen.add(tweet.id);
    if (tweet.id === input.platformPostId) continue;
    const isOwn = Boolean(
      tweet.author_id && tweet.author_id === input.platformUserId,
    );
    const repliedTo = repliedToOf.get(tweet.id);
    if (isOwn && (!repliedTo || ownSelfThread(tweet.id))) continue;
    const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
    const handle = user?.username ?? null;
    const parentId =
      !repliedTo || repliedTo === input.platformPostId ? null : repliedTo;
    const mediaKey = tweet.attachments?.media_keys?.[0];
    comments.push({
      ...common,
      id: tweet.id,
      authorName: isOwn ? "You" : (user?.name ?? "X user"),
      authorHandle: handle,
      text: tweet.text ?? "",
      attachment: mediaKey ? xMediaToAttachment(mediaByKey.get(mediaKey)) : null,
      createdAt: tweet.created_at ?? null,
      likeCount: tweet.public_metrics?.like_count,
      parentId,
      isOwn: isOwn || withAuthor(input, handle).isOwn,
    });
  }
  return comments;
}

/** Split posts into OR-query chunks that fit the Recent Search query limit. */
export function chunkXConversations(
  inputs: CommentFetchInput[],
): CommentFetchInput[][] {
  const chunks: CommentFetchInput[][] = [];
  let current: CommentFetchInput[] = [];
  let length = 0;
  for (const input of inputs) {
    const part = `conversation_id:${input.platformPostId}`;
    const extra = current.length ? part.length + 4 : part.length;
    if (current.length && length + extra > X_QUERY_MAX_CHARS) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    length += current.length ? part.length + 4 : part.length;
    current.push(input);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Fetch comments for MANY X posts of one account with as few Recent Search
 * calls as possible (one per ~13 posts instead of one per post).
 * Throws on HTTP 429 so the platform cache layer can set a cooldown and
 * serve stale data.
 */
export async function fetchTwitterCommentsBatch(
  inputs: CommentFetchInput[],
): Promise<Record<string, CommentFetchResult>> {
  const out: Record<string, CommentFetchResult> = {};
  if (!inputs.length) return out;
  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;
  const first = inputs[0]!;
  if (!appKey || !appSecret || !first.accessSecret) {
    for (const input of inputs) {
      out[input.publicationId] = err(
        "Twitter credentials incomplete. Reconnect the X account.",
      );
    }
    return out;
  }
  const client = new TwitterApi({
    appKey,
    appSecret,
    accessToken: first.accessToken,
    accessSecret: first.accessSecret,
  });
  const sevenDayMs = 7 * 24 * 60 * 60 * 1000;
  const edgeSlackMs = 2 * 60 * 1000;
  const windowMs = first.since ? Date.now() - Date.parse(first.since) : Infinity;
  const startTime =
    Number.isFinite(windowMs) && windowMs <= sevenDayMs - edgeSlackMs
      ? undefined
      : new Date(Date.now() - sevenDayMs + edgeSlackMs).toISOString();

  for (const chunk of chunkXConversations(inputs)) {
    const query = chunk
      .map((i) => `conversation_id:${i.platformPostId}`)
      .join(" OR ");
    try {
      const search = await client.v2.search(query, {
        max_results: 100,
        ...(startTime ? { start_time: startTime } : {}),
        "tweet.fields": [
          "created_at",
          "author_id",
          "referenced_tweets",
          "conversation_id",
          "attachments",
          "public_metrics",
        ],
        expansions: ["author_id", "attachments.media_keys"],
        "user.fields": ["name", "username"],
        "media.fields": ["url", "preview_image_url", "type", "variants"],
      });
      const users = new Map<string, { name?: string; username?: string }>();
      const mediaByKey = new Map<string, XMediaLike>();
      const tweets: TweetV2[] = [];
      for (let page = 0; page < X_SEARCH_PAGE_CAP; page++) {
        for (const u of search.includes?.users ?? []) {
          users.set(u.id, { name: u.name, username: u.username });
        }
        for (const m of search.includes?.media ?? []) {
          if (m.media_key) mediaByKey.set(m.media_key, m);
        }
        tweets.push(...(search.tweets ?? []));
        if (search.done) break;
        try {
          await search.fetchNext();
        } catch {
          break;
        }
      }
      const byConversation = new Map<string, TweetV2[]>();
      for (const tweet of tweets) {
        const cid = tweet.conversation_id;
        if (!cid) continue;
        const list = byConversation.get(cid);
        if (list) list.push(tweet);
        else byConversation.set(cid, [tweet]);
      }
      for (const input of chunk) {
        out[input.publicationId] = {
          comments: tweetsToComments(
            input,
            byConversation.get(input.platformPostId) ?? [],
            users,
            mediaByKey,
          ),
          status: "ok",
          error: startTime
            ? "X comments only go back 7 days (Recent Search)."
            : undefined,
        };
      }
    } catch (e) {
      if (extractHttpStatus(e) === 429) throw e;
      const msg = e instanceof Error ? e.message : "X replies failed";
      for (const input of chunk) {
        out[input.publicationId] = err(msg);
      }
    }
  }
  return out;
}

async function fetchTwitter(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  try {
    const results = await fetchTwitterCommentsBatch([input]);
    return results[input.publicationId] ?? err("X replies failed");
  } catch (e) {
    return err(e instanceof Error ? e.message : "X replies failed");
  }
}

async function fetchBluesky(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const handle = input.accountLabel?.replace(/^@/, "") ?? "";
  if (!handle || !input.accessSecret) {
    return err("Bluesky credentials incomplete. Reconnect the account.");
  }

  const urlFor = (uri: string) => {
    const url = new URL("https://bsky.social/xrpc/app.bsky.feed.getPostThread");
    url.searchParams.set("uri", uri);
    url.searchParams.set("depth", "3");
    return url.toString();
  };

  let session = await blueskySession(input.accountId, handle, input.accessSecret);
  if (!session) {
    return err("Bluesky login failed. Reconnect the account.");
  }
  let { ok, data, status } = await jsonGet(urlFor(input.platformPostId), {
    Authorization: `Bearer ${session.accessJwt}`,
  });
  if (status === 401) {
    session = await blueskySessionAfter401(
      input.accountId,
      handle,
      input.accessSecret,
    );
    if (!session) return err("Bluesky login failed. Reconnect the account.");
    const retry = await jsonGet(urlFor(input.platformPostId), {
      Authorization: `Bearer ${session.accessJwt}`,
    });
    ok = retry.ok;
    data = retry.data;
    status = retry.status;
  }
  if (!ok) {
    const msg =
      (data as { message?: string; error?: string })?.message ??
      (data as { error?: string })?.error ??
      "Bluesky thread failed";
    if (status === 404 || isGonePlatformPost(msg)) {
      return { comments: [], status: "ok" };
    }
    return err(msg);
  }

  type ThreadNode = {
    $type?: string;
    post?: {
      uri?: string;
      author?: { displayName?: string; handle?: string };
      record?: { text?: string; createdAt?: string };
      embed?: unknown;
      likeCount?: number;
      viewer?: { like?: string };
    };
    replies?: ThreadNode[];
  };

  const root = (data as { thread?: ThreadNode }).thread;
  const rootType = root?.$type ?? "";
  if (
    !root?.post?.uri ||
    /notFound|blocked/i.test(rootType)
  ) {
    return { comments: [], status: "ok" };
  }

  const comments: InboxComment[] = [];
  const common = base(input);

  function walk(node: ThreadNode | undefined, parentId: string | null) {
    if (!node?.post?.uri) return;
    if (node.post.uri !== input.platformPostId) {
      comments.push({
        ...common,
        id: node.post.uri,
        authorName:
          node.post.author?.displayName ??
          node.post.author?.handle ??
          "Bluesky user",
        authorHandle: node.post.author?.handle ?? null,
        text: node.post.record?.text ?? "",
        attachment: parseBskyViewEmbed(node.post.embed),
        createdAt: node.post.record?.createdAt ?? null,
        likeCount: node.post.likeCount,
        likedByMe: Boolean(node.post.viewer?.like),
        parentId,
        ...withAuthor(input, node.post.author?.handle ?? null),
      });
    }
    for (const child of node.replies ?? []) {
      walk(child, node.post.uri === input.platformPostId ? null : node.post.uri);
    }
  }

  walk(root, null);
  return { comments, status: "ok" };
}

async function fetchLinkedIn(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const urn = input.platformPostId.includes("urn:")
    ? input.platformPostId
    : `urn:li:share:${input.platformPostId}`;
  const url = `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(urn)}/comments`;
  const { ok, data, status } = await jsonGet(url, {
    Authorization: `Bearer ${input.accessToken}`,
    "LinkedIn-Version": "202411",
    "X-Restli-Protocol-Version": "2.0.0",
  });
  if (!ok) {
    if (status === 403) {
      return {
        comments: [],
        status: "unsupported",
        error: "LinkedIn comments need additional product access.",
      };
    }
    return err(
      (data as { message?: string })?.message ?? "LinkedIn comments failed",
    );
  }
  const elements =
    (data as { elements?: Array<Record<string, unknown>> })?.elements ?? [];
  const common = { ...base(input), canReply: false };
  const comments: InboxComment[] = elements.map((el) => {
    const msg = el.message as { text?: string } | undefined;
    const created = el.created as { time?: number; actor?: string } | undefined;
    const actor =
      (typeof el.actor === "string" && el.actor) ||
      (typeof created?.actor === "string" && created.actor) ||
      (typeof el.commenter === "string" && el.commenter) ||
      null;
    const likes = el.likesSummary as
      | { totalLikes?: number; selected?: boolean }
      | undefined;
    const isOwn = sameLinkedInActor(actor, input.platformUserId);
    return {
      ...common,
      id: String(el.$URN ?? el.commentUrn ?? el.id ?? ""),
      authorName: isOwn ? "You" : "LinkedIn user",
      authorHandle: actor,
      text: msg?.text ?? "",
      createdAt:
        typeof created?.time === "number"
          ? new Date(created.time).toISOString()
          : null,
      likeCount: typeof likes?.totalLikes === "number" ? likes.totalLikes : undefined,
      likedByMe: typeof likes?.selected === "boolean" ? likes.selected : undefined,
      parentId: null,
      isOwn,
    };
  });
  return { comments, status: "ok" };
}

export async function fetchPublicationComments(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  let result: CommentFetchResult;
  switch (input.platform) {
    case "facebook":
      result = await fetchFacebook(input);
      break;
    case "instagram":
      result = await fetchInstagram(input);
      break;
    case "threads":
      result = await fetchThreads(input);
      break;
    case "youtube":
      result = await fetchYouTube(input);
      break;
    case "twitter_x":
      result = await fetchTwitter(input);
      break;
    case "bluesky":
      result = await fetchBluesky(input);
      break;
    case "linkedin":
      result = await fetchLinkedIn(input);
      break;
    default:
      return {
        comments: [],
        status: "unsupported",
        error: `Comments not supported for ${input.platform}`,
      };
  }
  return {
    ...result,
    comments: result.comments.map((c) => {
      const media = withMediaFallback(c.text, c.attachment);
      return { ...c, text: media.text, attachment: media.attachment };
    }),
  };
}
