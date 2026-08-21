/**
 * Like / unlike a comment on the originating platform.
 */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";
import { jsonGet } from "../http-json.js";
import { blueskySession, blueskySessionAfter401 } from "./bluesky-session.js";

export type LikeCommentInput = {
  platform: string;
  commentId: string;
  accessToken: string;
  accessSecret?: string | null;
  platformUserId: string;
  accountId?: string;
  accountHandle?: string | null;
  /** When true, remove the like instead of creating one. */
  unlike?: boolean;
};

export type LikeCommentResult =
  | { ok: true }
  | { ok: false; error: string };

function fail(message: string): LikeCommentResult {
  return { ok: false, error: message };
}

function verb(unlike: boolean | undefined): string {
  return unlike ? "unlike" : "like";
}

async function likeFacebook(input: LikeCommentInput): Promise<LikeCommentResult> {
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.commentId)}/likes?access_token=${encodeURIComponent(input.accessToken)}`;
  const res = await fetch(url, {
    method: input.unlike ? "DELETE" : "POST",
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!res.ok) {
    return fail(data.error?.message ?? `Facebook ${verb(input.unlike)} failed`);
  }
  return { ok: true };
}

async function likeInstagram(input: LikeCommentInput): Promise<LikeCommentResult> {
  const url = `https://graph.instagram.com/v21.0/${encodeURIComponent(input.commentId)}/likes?access_token=${encodeURIComponent(input.accessToken)}`;
  const res = await fetch(url, {
    method: input.unlike ? "DELETE" : "POST",
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!res.ok) {
    return fail(
      data.error?.message ?? `Instagram ${verb(input.unlike)} failed`,
    );
  }
  return { ok: true };
}

async function likeTwitter(input: LikeCommentInput): Promise<LikeCommentResult> {
  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;
  if (!appKey || !appSecret || !input.accessSecret) {
    return fail("X credentials incomplete. Reconnect the account.");
  }
  try {
    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken: input.accessToken,
      accessSecret: input.accessSecret,
    });
    if (input.unlike) {
      await client.v2.unlike(input.platformUserId, input.commentId);
    } else {
      await client.v2.like(input.platformUserId, input.commentId);
    }
    return { ok: true };
  } catch (e) {
    return fail(
      e instanceof Error ? e.message : `X ${verb(input.unlike)} failed`,
    );
  }
}

async function likeBluesky(input: LikeCommentInput): Promise<LikeCommentResult> {
  const handle = input.accountHandle;
  if (!handle || !input.accessSecret) {
    return fail("Bluesky credentials incomplete. Reconnect the account.");
  }
  const accountKey = input.accountId ?? handle;
  let session = await blueskySession(accountKey, handle, input.accessSecret);
  if (!session) {
    return fail("Bluesky login failed. Reconnect the account.");
  }

  const uri = input.commentId;
  const threadUrl = new URL(
    "https://bsky.social/xrpc/app.bsky.feed.getPostThread",
  );
  threadUrl.searchParams.set("uri", uri);
  threadUrl.searchParams.set("depth", "0");

  let threadRes = await jsonGet(threadUrl.toString(), {
    Authorization: `Bearer ${session.accessJwt}`,
  });
  if (threadRes.status === 401) {
    session = await blueskySessionAfter401(accountKey, handle, input.accessSecret);
    if (!session) return fail("Bluesky login failed. Reconnect the account.");
    threadRes = await jsonGet(threadUrl.toString(), {
      Authorization: `Bearer ${session.accessJwt}`,
    });
  }
  const thread = threadRes.data as {
    thread?: {
      post?: {
        uri?: string;
        cid?: string;
        viewer?: { like?: string };
      };
    };
  };
  const post = thread.thread?.post;
  if (!threadRes.ok || !post?.uri || !post.cid) {
    return fail(
      `Could not load the Bluesky comment to ${verb(input.unlike)}.`,
    );
  }

  if (input.unlike) {
    const likeUri = post.viewer?.like;
    if (!likeUri) {
      return { ok: true };
    }
    const rkey = likeUri.split("/").pop();
    if (!rkey) return fail("Could not resolve Bluesky like record.");

    const deleteLike = async (jwt: string, did: string) =>
      fetch("https://bsky.social/xrpc/com.atproto.repo.deleteRecord", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: did,
          collection: "app.bsky.feed.like",
          rkey,
        }),
        signal: AbortSignal.timeout(12_000),
      });

    let deleteRes = await deleteLike(session.accessJwt, session.did);
    if (deleteRes.status === 401) {
      session = await blueskySessionAfter401(
        accountKey,
        handle,
        input.accessSecret,
      );
      if (!session) return fail("Bluesky login failed. Reconnect the account.");
      deleteRes = await deleteLike(session.accessJwt, session.did);
    }
    if (!deleteRes.ok) {
      const data = await deleteRes.json().catch(() => ({}));
      return fail(
        (data as { message?: string })?.message ?? "Bluesky unlike failed",
      );
    }
    return { ok: true };
  }

  const createLike = async (jwt: string, did: string) =>
    fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.like",
        record: {
          $type: "app.bsky.feed.like",
          subject: { uri: post.uri, cid: post.cid },
          createdAt: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(12_000),
    });

  let createRes = await createLike(session.accessJwt, session.did);
  if (createRes.status === 401) {
    session = await blueskySessionAfter401(accountKey, handle, input.accessSecret);
    if (!session) return fail("Bluesky login failed. Reconnect the account.");
    createRes = await createLike(session.accessJwt, session.did);
  }
  if (!createRes.ok) {
    const data = await createRes.json().catch(() => ({}));
    return fail(
      (data as { message?: string })?.message ?? "Bluesky like failed",
    );
  }
  return { ok: true };
}

async function likeThreads(input: LikeCommentInput): Promise<LikeCommentResult> {
  const url = `https://graph.threads.net/v1.0/${encodeURIComponent(input.commentId)}/likes?access_token=${encodeURIComponent(input.accessToken)}`;
  const res = await fetch(url, {
    method: input.unlike ? "DELETE" : "POST",
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!res.ok) {
    return fail(data.error?.message ?? `Threads ${verb(input.unlike)} failed`);
  }
  return { ok: true };
}

async function likeYouTube(input: LikeCommentInput): Promise<LikeCommentResult> {
  const url = new URL("https://www.googleapis.com/youtube/v3/comments/rate");
  url.searchParams.set("id", input.commentId);
  url.searchParams.set("rating", input.unlike ? "none" : "like");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 204 || res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  return fail(data.error?.message ?? `YouTube ${verb(input.unlike)} failed`);
}

async function likeLinkedIn(input: LikeCommentInput): Promise<LikeCommentResult> {
  const urn = input.commentId.includes("urn:")
    ? input.commentId
    : `urn:li:comment:(${input.commentId})`;
  const url = `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(urn)}/likes`;
  const res = await fetch(url, {
    method: input.unlike ? "DELETE" : "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "LinkedIn-Version": "202411",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: input.unlike ? undefined : "{}",
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 201 || res.status === 204 || res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return fail(data.message ?? `LinkedIn ${verb(input.unlike)} failed`);
}

export async function likeCommentOnPlatform(
  input: LikeCommentInput,
): Promise<LikeCommentResult> {
  switch (input.platform) {
    case "facebook":
      return likeFacebook(input);
    case "instagram":
      return likeInstagram(input);
    case "twitter_x":
      return likeTwitter(input);
    case "bluesky":
      return likeBluesky(input);
    case "threads":
      return likeThreads(input);
    case "youtube":
      return likeYouTube(input);
    case "linkedin":
      return likeLinkedIn(input);
    default:
      return fail(
        `${input.unlike ? "Unliking" : "Liking"} comments is not supported for ${input.platform} yet.`,
      );
  }
}

export function inboxCommentLikeSupported(platform: string): boolean {
  return (
    platform === "facebook" ||
    platform === "instagram" ||
    platform === "twitter_x" ||
    platform === "bluesky" ||
    platform === "threads" ||
    platform === "youtube" ||
    platform === "linkedin"
  );
}
