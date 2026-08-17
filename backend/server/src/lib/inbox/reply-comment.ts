/** Post a reply to a comment on the originating platform. */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";

export type ReplyInput = {
  platform: string;
  commentId: string;
  text: string;
  accessToken: string;
  accessSecret?: string | null;
  platformUserId: string;
  /** Bluesky original post URI (thread root). */
  platformPostId?: string;
  accountHandle?: string | null;
};

export type ReplyResult = { ok: true } | { ok: false; error: string };

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
  return { ok: true };
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
  return { ok: true };
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
  return { ok: true };
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
  return { ok: true };
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
    await client.v2.reply(input.text, input.commentId);
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "X reply failed");
  }
}

async function replyBluesky(input: ReplyInput): Promise<ReplyResult> {
  const handle = input.accountHandle;
  const appPassword = input.accessSecret;
  const rootUri = input.platformPostId;
  if (!handle || !appPassword || !rootUri) {
    return fail("Bluesky credentials incomplete. Reconnect the account.");
  }
  const sessionRes = await fetch(
    "https://bsky.social/xrpc/com.atproto.server.createSession",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
    },
  );
  const session = (await sessionRes.json().catch(() => ({}))) as {
    accessJwt?: string;
    did?: string;
  };
  if (!sessionRes.ok || !session.accessJwt || !session.did) {
    return fail("Bluesky login failed. Reconnect the account.");
  }

  const threadRes = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(input.commentId)}&depth=0`,
  );
  const thread = (await threadRes.json().catch(() => ({}))) as {
    thread?: { post?: { uri?: string; cid?: string } };
  };
  const parent = thread.thread?.post;
  if (!parent?.uri || !parent.cid) {
    return fail("Could not load the Bluesky comment to reply to.");
  }

  const rootRes = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(rootUri)}`,
  );
  const rootData = (await rootRes.json().catch(() => ({}))) as {
    posts?: Array<{ uri?: string; cid?: string }>;
  };
  const root = rootData.posts?.[0];
  if (!root?.uri || !root.cid) {
    return fail("Could not load the Bluesky post root.");
  }

  const createRes = await fetch(
    "https://bsky.social/xrpc/com.atproto.repo.createRecord",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text: input.text,
          createdAt: new Date().toISOString(),
          reply: {
            root: { uri: root.uri, cid: root.cid },
            parent: { uri: parent.uri, cid: parent.cid },
          },
        },
      }),
    },
  );
  if (!createRes.ok) {
    const data = await createRes.json().catch(() => ({}));
    return fail(
      (data as { message?: string })?.message ?? "Bluesky reply failed",
    );
  }
  return { ok: true };
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
  if (!text) return fail("Reply cannot be empty.");
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
