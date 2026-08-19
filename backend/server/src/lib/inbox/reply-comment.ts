/** Post a reply to a comment on the originating platform. */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";
import { fetchAllowedMedia } from "../media-fetch.js";
import { jsonGet } from "../http-json.js";
import { uploadTwitterImage, uploadTwitterVideo } from "../twitter-media.js";
import { inboxAllowsMedia } from "./media-capabilities.js";
import { blueskySession, blueskySessionAfter401 } from "./bluesky-session.js";

export type ReplyInput = {
  platform: string;
  commentId: string;
  text: string;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  accessToken: string;
  accessSecret?: string | null;
  accountId?: string;
  platformUserId: string;
  /** Bluesky original post URI (thread root). */
  platformPostId?: string;
  accountHandle?: string | null;
};

export type ReplyResult =
  | { ok: true; replyId?: string }
  | { ok: false; error: string };

async function formPost(
  url: string,
  body: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function fail(message: string): ReplyResult {
  return { ok: false, error: message };
}

async function replyFacebook(input: ReplyInput): Promise<ReplyResult> {
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.commentId)}/comments`;
  const { ok, data } = await formPost(url, {
    message: input.text,
    access_token: input.accessToken,
  });
  if (!ok) {
    return fail(
      (data as { error?: { message?: string } })?.error?.message ??
        "Facebook reply failed",
    );
  }
  return {
    ok: true,
    replyId:
      typeof (data as { id?: string }).id === "string"
        ? (data as { id: string }).id
        : undefined,
  };
}

async function replyInstagram(input: ReplyInput): Promise<ReplyResult> {
  const url = `https://graph.instagram.com/v21.0/${encodeURIComponent(input.commentId)}/replies`;
  const { ok, data } = await formPost(url, {
    message: input.text,
    access_token: input.accessToken,
  });
  if (!ok) {
    return fail(
      (data as { error?: { message?: string } })?.error?.message ??
        "Instagram reply failed",
    );
  }
  return {
    ok: true,
    replyId:
      typeof (data as { id?: string }).id === "string"
        ? (data as { id: string }).id
        : undefined,
  };
}

async function replyThreads(input: ReplyInput): Promise<ReplyResult> {
  const user = encodeURIComponent(input.platformUserId || "me");
  const createUrl = `https://graph.threads.net/v1.0/${user}/threads`;
  const created = await formPost(createUrl, {
    media_type: "TEXT",
    text: input.text,
    reply_to_id: input.commentId,
    access_token: input.accessToken,
  });
  const creationId = (created.data as { id?: string })?.id;
  if (!created.ok || !creationId) {
    return fail(
      (created.data as { error?: { message?: string } })?.error?.message ??
        "Threads reply create failed",
    );
  }
  const publishUrl = `https://graph.threads.net/v1.0/${user}/threads_publish`;
  const published = await formPost(publishUrl, {
    creation_id: creationId,
    access_token: input.accessToken,
  });
  if (!published.ok) {
    return fail(
      (published.data as { error?: { message?: string } })?.error?.message ??
        "Threads reply publish failed",
    );
  }
  return {
    ok: true,
    replyId:
      typeof (published.data as { id?: string }).id === "string"
        ? (published.data as { id: string }).id
        : creationId,
  };
}

async function replyYouTube(input: ReplyInput): Promise<ReplyResult> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/comments?part=snippet",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: { parentId: input.commentId, textOriginal: input.text },
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return fail(
      (data as { error?: { message?: string } })?.error?.message ??
        "YouTube reply failed — reconnect YouTube to grant comment access.",
    );
  }
  return {
    ok: true,
    replyId:
      typeof (data as { id?: string }).id === "string"
        ? (data as { id: string }).id
        : undefined,
  };
}

async function replyTwitter(input: ReplyInput): Promise<ReplyResult> {
  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;
  if (!appKey || !appSecret || !input.accessSecret) {
    return fail("Twitter credentials incomplete. Reconnect the X account.");
  }
  try {
    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken: input.accessToken,
      accessSecret: input.accessSecret,
    });
    const body: {
      text?: string;
      reply: { in_reply_to_tweet_id: string };
      media?: { media_ids: [string] };
    } = { reply: { in_reply_to_tweet_id: input.commentId } };
    if (input.text.trim()) body.text = input.text.trim();
    if (input.mediaUrl && input.mediaMimeType) {
      const mediaId = input.mediaMimeType.startsWith("video/")
        ? await uploadTwitterVideo(input.mediaUrl, input.accessToken, input.accessSecret)
        : await uploadTwitterImage(input.mediaUrl, input.accessToken, input.accessSecret);
      body.media = { media_ids: [mediaId] };
    }
    if (!body.text && !body.media) return fail("Reply cannot be empty.");
    const created = await client.v2.tweet(body);
    return { ok: true, replyId: created.data.id };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "X reply failed");
  }
}

async function uploadBlueskyReplyBlob(
  jwt: string,
  mediaUrl: string,
): Promise<unknown> {
  const res = await fetchAllowedMedia(mediaUrl);
  if (!res.ok) throw new Error("Could not fetch image for Bluesky reply.");
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const uploadRes = await fetch(
    "https://bsky.social/xrpc/com.atproto.repo.uploadBlob",
    {
      method: "POST",
      headers: { "Content-Type": contentType, Authorization: `Bearer ${jwt}` },
      body: buffer,
    },
  );
  const data = (await uploadRes.json().catch(() => ({}))) as { blob?: unknown };
  if (!uploadRes.ok || !data.blob) {
    throw new Error("Bluesky image upload failed.");
  }
  return data.blob;
}

async function replyBluesky(input: ReplyInput): Promise<ReplyResult> {
  const handle = input.accountHandle;
  const rootUri = input.platformPostId;
  if (!handle || !input.accessSecret || !rootUri) {
    return fail("Bluesky credentials incomplete. Reconnect the account.");
  }
  const accountKey = input.accountId ?? handle;
  let session = await blueskySession(accountKey, handle, input.accessSecret);
  if (!session) {
    return fail("Bluesky login failed. Reconnect the account.");
  }

  const authedGet = async (url: string) => {
    let res = await jsonGet(url, {
      Authorization: `Bearer ${session!.accessJwt}`,
    });
    if (res.status === 401) {
      session = await blueskySessionAfter401(
        accountKey,
        handle,
        input.accessSecret!,
      );
      if (!session) return { ok: false, status: 401, data: {} };
      res = await jsonGet(url, {
        Authorization: `Bearer ${session.accessJwt}`,
      });
    }
    return res;
  };

  const parentUrl = new URL(
    "https://bsky.social/xrpc/app.bsky.feed.getPostThread",
  );
  parentUrl.searchParams.set("uri", input.commentId);
  parentUrl.searchParams.set("depth", "0");
  const threadRes = await authedGet(parentUrl.toString());
  const thread = threadRes.data as {
    thread?: { post?: { uri?: string; cid?: string } };
  };
  const parent = thread.thread?.post;
  if (!threadRes.ok || !parent?.uri || !parent.cid) {
    return fail("Could not load the Bluesky comment to reply to.");
  }

  const rootUrl = new URL("https://bsky.social/xrpc/app.bsky.feed.getPosts");
  rootUrl.searchParams.set("uris", rootUri);
  const rootRes = await authedGet(rootUrl.toString());
  const rootData = rootRes.data as {
    posts?: Array<{ uri?: string; cid?: string }>;
  };
  const root = rootData.posts?.[0];
  if (!rootRes.ok || !root?.uri || !root.cid) {
    return fail("Could not load the Bluesky post root.");
  }

  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text: input.text,
    createdAt: new Date().toISOString(),
    reply: {
      root: { uri: root.uri, cid: root.cid },
      parent: { uri: parent.uri, cid: parent.cid },
    },
  };

  const postRecord = async (accessJwt: string, did: string, rec: Record<string, unknown>) =>
    fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessJwt}`,
      },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.post",
        record: rec,
      }),
    });

  if (input.mediaUrl && input.mediaMimeType?.startsWith("image/")) {
    const blob = await uploadBlueskyReplyBlob(session.accessJwt, input.mediaUrl);
    record.embed = {
      $type: "app.bsky.embed.images",
      images: [{ alt: "", image: blob }],
    };
  }

  let createRes = await postRecord(session.accessJwt, session.did, record);
  if (createRes.status === 401) {
    session = await blueskySessionAfter401(accountKey, handle, input.accessSecret);
    if (!session) return fail("Bluesky login failed. Reconnect the account.");
    createRes = await postRecord(session.accessJwt, session.did, record);
  }
  if (!createRes.ok) {
    const data = await createRes.json().catch(() => ({}));
    return fail(
      (data as { message?: string })?.message ?? "Bluesky reply failed",
    );
  }
  const created = (await createRes.json().catch(() => ({}))) as {
    uri?: string;
  };
  return { ok: true, replyId: created.uri };
}

const REPLY_MAX: Record<string, number> = {
  twitter_x: 280,
  bluesky: 300,
  threads: 500,
};

export function replyMaxLength(platform: string): number {
  return REPLY_MAX[platform] ?? 2000;
}

export async function replyOnPlatform(input: ReplyInput): Promise<ReplyResult> {
  const text = input.text.trim();
  const hasMedia = Boolean(input.mediaUrl && input.mediaMimeType);
  if (!text && !hasMedia) return fail("Reply cannot be empty.");
  if (
    hasMedia &&
    input.mediaMimeType &&
    !inboxAllowsMedia(input.platform, "comment", input.mediaMimeType)
  ) {
    return fail(`${input.platform} does not support this attachment type in comments.`);
  }
  const max = replyMaxLength(input.platform);
  if (text.length > max) return fail(`Reply is too long (max ${max} characters).`);

  switch (input.platform) {
    case "facebook":
      return replyFacebook(input);
    case "instagram":
      return replyInstagram(input);
    case "threads":
      return replyThreads(input);
    case "youtube":
      return replyYouTube(input);
    case "twitter_x":
      return replyTwitter(input);
    case "bluesky":
      return replyBluesky(input);
    default:
      return fail(`Replies are not supported for ${input.platform} yet.`);
  }
}
