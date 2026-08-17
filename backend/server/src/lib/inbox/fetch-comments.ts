/**
 * Live comment fetchers. Failures degrade — never throw past the dispatcher.
 */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";
import type { InboxComment } from "./types.js";
import { INBOX_UNSUPPORTED, sameInboxHandle, youtubeAuthorChannelId } from "./types.js";
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
};

export type CommentFetchResult = {
  comments: InboxComment[];
  status: "ok" | "scope_missing" | "unsupported" | "error";
  error?: string;
  missingScopes?: string[];
};

function base(input: CommentFetchInput): Omit<
  InboxComment,
  "id" | "authorName" | "authorHandle" | "text" | "createdAt" | "parentId" | "likeCount" | "isOwn"
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

async function jsonGet(
  url: string,
  headers?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
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

async function fetchFacebook(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const id = encodeURIComponent(input.platformPostId);
  const url = `https://graph.facebook.com/v21.0/${id}/comments?fields=id,from,message,created_time,like_count,attachment,comments.limit(5){id,from,message,created_time,attachment}&limit=25&access_token=${encodeURIComponent(input.accessToken)}`;
  const { ok, data } = await jsonGet(url);
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "Facebook comments failed";
    if (/permission|#200|#10|manage_engagement/i.test(msg)) {
      return err(msg, ["pages_manage_engagement"]);
    }
    return err(msg);
  }
  const rows = (data as { data?: Array<Record<string, unknown>> })?.data ?? [];
  const comments: InboxComment[] = [];
  const common = base(input);
  for (const row of rows) {
    const from = row.from as { name?: string; id?: string } | undefined;
    const media = withMediaFallback(
      String(row.message ?? ""),
      parseFbCommentAttachment(row.attachment),
    );
    comments.push({
      ...common,
      id: String(row.id ?? ""),
      authorName: from?.name ?? "Facebook user",
      authorHandle: from?.id ?? null,
      text: media.text,
      attachment: media.attachment,
      createdAt: typeof row.created_time === "string" ? row.created_time : null,
      likeCount:
        typeof row.like_count === "number" ? row.like_count : undefined,
      parentId: null,
      isOwn: Boolean(from?.id && from.id === input.platformUserId),
    });
    const nested =
      (row.comments as { data?: Array<Record<string, unknown>> } | undefined)
        ?.data ?? [];
    for (const child of nested) {
      const cfrom = child.from as { name?: string; id?: string } | undefined;
      const childMedia = withMediaFallback(
        String(child.message ?? ""),
        parseFbCommentAttachment(child.attachment),
      );
      comments.push({
        ...common,
        id: String(child.id ?? ""),
        authorName: cfrom?.name ?? "Facebook user",
        authorHandle: cfrom?.id ?? null,
        text: childMedia.text,
        attachment: childMedia.attachment,
        createdAt:
          typeof child.created_time === "string" ? child.created_time : null,
        parentId: String(row.id ?? ""),
        isOwn: Boolean(cfrom?.id && cfrom.id === input.platformUserId),
      });
    }
  }
  return { comments, status: "ok" };
}

async function fetchInstagram(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const id = encodeURIComponent(input.platformPostId);
  const url = `https://graph.instagram.com/v21.0/${id}/comments?fields=id,text,username,timestamp,like_count,replies{id,text,username,timestamp}&limit=25&access_token=${encodeURIComponent(input.accessToken)}`;
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
  const rows = (data as { data?: Array<Record<string, unknown>> })?.data ?? [];
  const comments: InboxComment[] = [];
  const common = base(input);
  for (const row of rows) {
    const handle = typeof row.username === "string" ? row.username : null;
    comments.push({
      ...common,
      id: String(row.id ?? ""),
      authorName: handle ?? "Instagram user",
      authorHandle: handle,
      text: String(row.text ?? ""),
      createdAt: typeof row.timestamp === "string" ? row.timestamp : null,
      likeCount:
        typeof row.like_count === "number" ? row.like_count : undefined,
      parentId: null,
      ...withAuthor(input, handle),
    });
    const nested =
      (row.replies as { data?: Array<Record<string, unknown>> } | undefined)
        ?.data ?? [];
    for (const child of nested) {
      const ch = typeof child.username === "string" ? child.username : null;
      comments.push({
        ...common,
        id: String(child.id ?? ""),
        authorName: ch ?? "Instagram user",
        authorHandle: ch,
        text: String(child.text ?? ""),
        createdAt: typeof child.timestamp === "string" ? child.timestamp : null,
        parentId: String(row.id ?? ""),
        ...withAuthor(input, ch),
      });
    }
  }
  return { comments, status: "ok" };
}

async function fetchThreads(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const id = encodeURIComponent(input.platformPostId);
  const url = `https://graph.threads.net/v1.0/${id}/replies?fields=id,text,username,timestamp&limit=25&access_token=${encodeURIComponent(input.accessToken)}`;
  const { ok, data } = await jsonGet(url);
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "Threads replies failed";
    if (/permission|manage_replies/i.test(msg)) {
      return err(msg, ["threads_manage_replies"]);
    }
    return err(msg);
  }
  const rows = (data as { data?: Array<Record<string, unknown>> })?.data ?? [];
  const common = base(input);
  const comments: InboxComment[] = rows.map((row) => {
    const handle = typeof row.username === "string" ? row.username : null;
    return {
      ...common,
      id: String(row.id ?? ""),
      authorName: handle ?? "Threads user",
      authorHandle: handle,
      text: String(row.text ?? ""),
      createdAt: typeof row.timestamp === "string" ? row.timestamp : null,
      parentId: null,
      ...withAuthor(input, handle),
    };
  });
  return { comments, status: "ok" };
}

async function fetchYouTube(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const url = new URL(
    "https://www.googleapis.com/youtube/v3/commentThreads",
  );
  url.searchParams.set("part", "snippet,replies");
  url.searchParams.set("videoId", input.platformPostId);
  url.searchParams.set("maxResults", "25");
  url.searchParams.set("textFormat", "plainText");
  const { ok, data } = await jsonGet(url.toString(), {
    Authorization: `Bearer ${input.accessToken}`,
  });
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "YouTube comments failed";
    if (/disabled|commentsDisabled/i.test(msg)) {
      return { comments: [], status: "ok" };
    }
    return err(msg);
  }
  const items =
    (data as { items?: Array<Record<string, unknown>> })?.items ?? [];
  const comments: InboxComment[] = [];
  const common = base(input);
  for (const item of items) {
    const top = (item.snippet as { topLevelComment?: { id?: string; snippet?: Record<string, unknown> } })
      ?.topLevelComment;
    const sn = top?.snippet;
    if (!top?.id || !sn) continue;
    comments.push({
      ...common,
      id: top.id,
      authorName: String(sn.authorDisplayName ?? "YouTube user"),
      authorHandle: null,
      text: String(sn.textDisplay ?? sn.textOriginal ?? ""),
      createdAt: typeof sn.publishedAt === "string" ? sn.publishedAt : null,
      likeCount: typeof sn.likeCount === "number" ? sn.likeCount : undefined,
      parentId: null,
      isOwn: youtubeAuthorChannelId(sn.authorChannelId) === input.platformUserId,
    });
    const replies =
      (item.replies as { comments?: Array<{ id?: string; snippet?: Record<string, unknown> }> })
        ?.comments ?? [];
    for (const r of replies) {
      const rs = r.snippet;
      if (!r.id || !rs) continue;
      comments.push({
        ...common,
        id: r.id,
        authorName: String(rs.authorDisplayName ?? "YouTube user"),
        authorHandle: null,
        text: String(rs.textDisplay ?? rs.textOriginal ?? ""),
        createdAt: typeof rs.publishedAt === "string" ? rs.publishedAt : null,
        parentId: top.id,
        isOwn: youtubeAuthorChannelId(rs.authorChannelId) === input.platformUserId,
      });
    }
  }
  return { comments, status: "ok" };
}

async function fetchTwitter(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;
  if (!appKey || !appSecret || !input.accessSecret) {
    return err("Twitter credentials incomplete. Reconnect the X account.");
  }
  try {
    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken: input.accessToken,
      accessSecret: input.accessSecret,
    });
    const search = await client.v2.search(
      `conversation_id:${input.platformPostId}`,
      {
        max_results: 50,
        "tweet.fields": [
          "created_at",
          "author_id",
          "referenced_tweets",
          "conversation_id",
          "attachments",
        ],
        expansions: ["author_id", "attachments.media_keys"],
        "user.fields": ["name", "username"],
        "media.fields": ["url", "preview_image_url", "type", "variants"],
      },
    );
    const users = new Map<string, { name?: string; username?: string }>();
    for (const u of search.includes?.users ?? []) {
      users.set(u.id, { name: u.name, username: u.username });
    }
    const mediaByKey = new Map<string, XMediaLike>();
    for (const m of search.includes?.media ?? []) {
      if (m.media_key) mediaByKey.set(m.media_key, m);
    }
    const common = base(input);
    const tweets = search.tweets ?? [];
    const comments: InboxComment[] = [];
    for (const tweet of tweets) {
      if (tweet.id === input.platformPostId) continue;
      const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
      const handle = user?.username ?? null;
      const repliedTo = tweet.referenced_tweets?.find(
        (r) => r.type === "replied_to",
      )?.id;
      // Direct reply to the Social0 post = top-level comment; else nest under parent tweet.
      const parentId =
        !repliedTo || repliedTo === input.platformPostId ? null : repliedTo;
      const mediaKey = tweet.attachments?.media_keys?.[0];
      comments.push({
        ...common,
        id: tweet.id,
        authorName: user?.name ?? "X user",
        authorHandle: handle,
        text: tweet.text ?? "",
        attachment: mediaKey ? xMediaToAttachment(mediaByKey.get(mediaKey)) : null,
        createdAt: tweet.created_at ?? null,
        parentId,
        ...withAuthor(input, handle),
      });
    }
    return { comments, status: "ok" };
  } catch (e) {
    return err(e instanceof Error ? e.message : "X replies failed");
  }
}

async function fetchBluesky(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  const url = new URL(
    "https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread",
  );
  url.searchParams.set("uri", input.platformPostId);
  url.searchParams.set("depth", "3");
  const { ok, data } = await jsonGet(url.toString());
  if (!ok) {
    return err(
      (data as { message?: string })?.message ?? "Bluesky thread failed",
    );
  }
  const comments: InboxComment[] = [];
  const common = base(input);

  type ThreadNode = {
    post?: {
      uri?: string;
      author?: { displayName?: string; handle?: string };
      record?: { text?: string; createdAt?: string };
      embed?: unknown;
      likeCount?: number;
    };
    replies?: ThreadNode[];
  };

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
        parentId,
        ...withAuthor(input, node.post.author?.handle ?? null),
      });
    }
    for (const child of node.replies ?? []) {
      walk(child, node.post.uri === input.platformPostId ? null : node.post.uri);
    }
  }

  walk((data as { thread?: ThreadNode }).thread, null);
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
    const created = el.created as { time?: number } | undefined;
    return {
      ...common,
      id: String(el.id ?? el.$URN ?? ""),
      authorName: "LinkedIn user",
      authorHandle: null,
      text: msg?.text ?? "",
      createdAt:
        typeof created?.time === "number"
          ? new Date(created.time).toISOString()
          : null,
      parentId: null,
    };
  });
  return { comments, status: "ok" };
}

export async function fetchPublicationComments(
  input: CommentFetchInput,
): Promise<CommentFetchResult> {
  if (INBOX_UNSUPPORTED.has(input.platform)) {
    return {
      comments: [],
      status: "unsupported",
      error: `Comments inbox is not available for ${input.platform} yet.`,
    };
  }
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
