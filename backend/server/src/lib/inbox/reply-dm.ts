/** Send a DM on the originating platform. */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";

export type DmReplyInput = {
  platform: string;
  conversationId: string;
  peerId: string;
  text: string;
  accessToken: string;
  accessSecret?: string | null;
  platformUserId: string;
  accountHandle?: string | null;
};

export type DmReplyResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

function fail(message: string): DmReplyResult {
  return { ok: false, error: message };
}

async function jsonPost(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function graphError(data: unknown, fallback: string): string {
  return (
    (data as { error?: { message?: string } })?.error?.message ?? fallback
  );
}

async function replyFacebook(input: DmReplyInput): Promise<DmReplyResult> {
  if (!input.peerId) return fail("Missing recipient for this Facebook conversation.");
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.platformUserId)}/messages?access_token=${encodeURIComponent(input.accessToken)}`;
  const { ok, data } = await jsonPost(url, {
    recipient: { id: input.peerId },
    messaging_type: "RESPONSE",
    message: { text: input.text },
  });
  if (!ok) return fail(graphError(data, "Facebook DM failed"));
  const id = (data as { message_id?: string })?.message_id;
  return { ok: true, messageId: id };
}

async function replyInstagram(input: DmReplyInput): Promise<DmReplyResult> {
  if (!input.peerId) return fail("Missing recipient for this Instagram conversation.");
  const url = `https://graph.instagram.com/v21.0/${encodeURIComponent(input.platformUserId)}/messages?access_token=${encodeURIComponent(input.accessToken)}`;
  const { ok, data } = await jsonPost(url, {
    recipient: { id: input.peerId },
    message: { text: input.text },
  });
  if (!ok) return fail(graphError(data, "Instagram DM failed"));
  const id = (data as { message_id?: string })?.message_id;
  return { ok: true, messageId: id };
}

async function replyTwitter(input: DmReplyInput): Promise<DmReplyResult> {
  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;
  if (!appKey || !appSecret || !input.accessSecret) {
    return fail("X credentials incomplete. Reconnect the account.");
  }
  if (!input.peerId) return fail("Missing recipient for this X conversation.");
  try {
    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken: input.accessToken,
      accessSecret: input.accessSecret,
    });
    const raw = await client.v2.post(
      `dm_conversations/with/${encodeURIComponent(input.peerId)}/messages`,
      { text: input.text },
    );
    const id = (raw as { data?: { dm_event_id?: string } })?.data?.dm_event_id;
    return { ok: true, messageId: id };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "X DM failed");
  }
}

async function replyBluesky(input: DmReplyInput): Promise<DmReplyResult> {
  const handle = input.accountHandle;
  const appPassword = input.accessSecret;
  if (!handle || !appPassword) {
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
  };
  if (!sessionRes.ok || !session.accessJwt) {
    return fail("Bluesky login failed. Reconnect the account.");
  }
  const res = await fetch("https://api.bsky.chat/xrpc/chat.bsky.convo.sendMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      convoId: input.conversationId,
      message: { text: input.text },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return fail((data as { message?: string })?.message ?? "Bluesky DM failed");
  }
  const id = (data as { id?: string })?.id;
  return { ok: true, messageId: id };
}

export async function replyToDmOnPlatform(
  input: DmReplyInput,
): Promise<DmReplyResult> {
  const text = input.text.trim();
  if (!text) return fail("Message is empty.");
  switch (input.platform) {
    case "facebook":
      return replyFacebook(input);
    case "instagram":
      return replyInstagram(input);
    case "twitter_x":
      return replyTwitter(input);
    case "bluesky":
      return replyBluesky(input);
    default:
      return fail(`DMs are not supported for ${input.platform}.`);
  }
}
