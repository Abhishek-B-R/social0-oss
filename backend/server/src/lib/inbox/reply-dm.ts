/** Send a DM on the originating platform. */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";
import { uploadTwitterImage, uploadTwitterVideo } from "../twitter-media.js";
import { inboxAllowsMedia } from "./media-capabilities.js";

export type DmReplyInput = {
  platform: string;
  conversationId: string;
  peerId: string;
  text: string;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
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

function graphAttachment(
  mediaUrl: string,
  mediaMimeType: string,
): { type: string; payload: { url: string; is_reusable?: boolean } } {
  const type = mediaMimeType.startsWith("video/") ? "video" : "image";
  return { type, payload: { url: mediaUrl, is_reusable: true } };
}

async function graphUploadAttachmentId(
  host: "graph.facebook.com" | "graph.instagram.com",
  platformUserId: string,
  accessToken: string,
  mediaUrl: string,
  mediaMimeType: string,
): Promise<{ id: string } | { error: string }> {
  const url = `https://${host}/v21.0/${encodeURIComponent(platformUserId)}/message_attachments?access_token=${encodeURIComponent(accessToken)}`;
  const { ok, data } = await jsonPost(url, {
    message: { attachment: graphAttachment(mediaUrl, mediaMimeType) },
  });
  if (!ok) {
    return {
      error: graphError(data, "Could not upload attachment — ensure media URL is public HTTPS."),
    };
  }
  const id = (data as { attachment_id?: string })?.attachment_id;
  if (!id) {
    return { error: "Platform did not return an attachment id." };
  }
  return { id };
}

async function replyGraphMessenger(
  host: "graph.facebook.com" | "graph.instagram.com",
  input: DmReplyInput,
  opts?: { messagingType?: string },
): Promise<DmReplyResult> {
  if (!input.peerId) return fail("Missing recipient for this conversation.");
  const sendUrl = `https://${host}/v21.0/${encodeURIComponent(input.platformUserId)}/messages?access_token=${encodeURIComponent(input.accessToken)}`;

  const message: Record<string, unknown> = {};
  if (input.text.trim()) message.text = input.text.trim();
  if (input.mediaUrl && input.mediaMimeType) {
    message.attachment = graphAttachment(input.mediaUrl, input.mediaMimeType);
  }
  if (!message.text && !message.attachment) return fail("Message is empty.");

  const body: Record<string, unknown> = {
    recipient: { id: input.peerId },
    message,
  };
  if (opts?.messagingType) body.messaging_type = opts.messagingType;

  let { ok, data } = await jsonPost(sendUrl, body);
  if (ok) {
    return { ok: true, messageId: (data as { message_id?: string })?.message_id };
  }

  if (!input.mediaUrl || !input.mediaMimeType) {
    return fail(graphError(data, "Message failed"));
  }

  const type = input.mediaMimeType.startsWith("video/") ? "video" : "image";
  const uploadHosts: Array<"graph.facebook.com" | "graph.instagram.com"> =
    host === "graph.instagram.com"
      ? ["graph.instagram.com", "graph.facebook.com"]
      : ["graph.facebook.com"];

  for (const uploadHost of uploadHosts) {
    const uploaded = await graphUploadAttachmentId(
      uploadHost,
      input.platformUserId,
      input.accessToken,
      input.mediaUrl,
      input.mediaMimeType,
    );
    if ("error" in uploaded) continue;
    const retryMsg: Record<string, unknown> = {};
    if (input.text.trim()) retryMsg.text = input.text.trim();
    retryMsg.attachment = { type, payload: { attachment_id: uploaded.id } };
    const retryBody: Record<string, unknown> = {
      recipient: { id: input.peerId },
      message: retryMsg,
    };
    if (opts?.messagingType) retryBody.messaging_type = opts.messagingType;
    const retry = await jsonPost(sendUrl, retryBody);
    if (retry.ok) {
      return {
        ok: true,
        messageId: (retry.data as { message_id?: string })?.message_id,
      };
    }
    data = retry.data;
  }

  return fail(graphError(data, "Message with attachment failed"));
}

async function replyFacebook(input: DmReplyInput): Promise<DmReplyResult> {
  return replyGraphMessenger("graph.facebook.com", input, {
    messagingType: "RESPONSE",
  });
}

async function replyInstagram(input: DmReplyInput): Promise<DmReplyResult> {
  return replyGraphMessenger("graph.instagram.com", input);
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
    const body: { text?: string; attachments?: Array<{ media_id: string }> } = {};
    if (input.text.trim()) body.text = input.text.trim();
    if (input.mediaUrl && input.mediaMimeType && input.accessSecret) {
      const mediaId = input.mediaMimeType.startsWith("video/")
        ? await uploadTwitterVideo(input.mediaUrl, input.accessToken, input.accessSecret)
        : await uploadTwitterImage(input.mediaUrl, input.accessToken, input.accessSecret);
      body.attachments = [{ media_id: mediaId }];
    }
    if (!body.text && !body.attachments?.length) return fail("Message is empty.");
    const raw = await client.v2.post(
      `dm_conversations/with/${encodeURIComponent(input.peerId)}/messages`,
      body,
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
  if (input.mediaUrl) {
    return fail("Bluesky DMs do not support attachments yet.");
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
  const hasMedia = Boolean(input.mediaUrl && input.mediaMimeType);
  if (!text && !hasMedia) return fail("Message is empty.");
  if (
    hasMedia &&
    input.mediaMimeType &&
    !inboxAllowsMedia(input.platform, "dm", input.mediaMimeType)
  ) {
    return fail(`${input.platform} does not support this attachment type in DMs.`);
  }

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
