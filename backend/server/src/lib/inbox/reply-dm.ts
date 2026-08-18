/** Send a DM on the originating platform. */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";
import { jsonPost } from "../http-json.js";
import { uploadTwitterImage, uploadTwitterVideo } from "../twitter-media.js";
import { inboxAllowsMedia } from "./media-capabilities.js";
import { blueskySession } from "./bluesky-session.js";

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
  accountId?: string;
  accountHandle?: string | null;
};

export type DmReplyResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

function fail(message: string): DmReplyResult {
  return { ok: false, error: message };
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

  const postMessage = async (
    message: Record<string, unknown>,
  ): Promise<DmReplyResult> => {
    const body: Record<string, unknown> = {
      recipient: { id: input.peerId },
      message,
    };
    if (opts?.messagingType) body.messaging_type = opts.messagingType;
    const { ok, data } = await jsonPost(sendUrl, body);
    if (ok) {
      return { ok: true, messageId: (data as { message_id?: string })?.message_id };
    }
    return fail(graphError(data, "Message failed"));
  };

  const hasText = Boolean(input.text.trim());
  const hasMedia = Boolean(input.mediaUrl && input.mediaMimeType);
  if (!hasText && !hasMedia) return fail("Message is empty.");

  // Graph rejects text + attachment in one payload — send separately.
  if (hasText && hasMedia) {
    const mediaResult = await postMessage({
      attachment: graphAttachment(input.mediaUrl!, input.mediaMimeType!),
    });
    if (!mediaResult.ok) return mediaResult;
    return postMessage({ text: input.text.trim() });
  }

  const message: Record<string, unknown> = {};
  if (hasText) message.text = input.text.trim();
  if (hasMedia) {
    message.attachment = graphAttachment(input.mediaUrl!, input.mediaMimeType!);
  }

  let result = await postMessage(message);
  if (result.ok || !hasMedia) return result;

  const type = input.mediaMimeType!.startsWith("video/") ? "video" : "image";
  const uploadHosts: Array<"graph.facebook.com" | "graph.instagram.com"> =
    host === "graph.instagram.com"
      ? ["graph.instagram.com", "graph.facebook.com"]
      : ["graph.facebook.com"];

  let lastError = result.error ?? "Message with attachment failed";
  for (const uploadHost of uploadHosts) {
    const uploaded = await graphUploadAttachmentId(
      uploadHost,
      input.platformUserId,
      input.accessToken,
      input.mediaUrl!,
      input.mediaMimeType!,
    );
    if ("error" in uploaded) continue;
    const retryMsg: Record<string, unknown> = {
      attachment: { type, payload: { attachment_id: uploaded.id } },
    };
    if (hasText) retryMsg.text = input.text.trim();
    const retry = await postMessage(retryMsg);
    if (retry.ok) return retry;
    lastError = retry.error;
  }

  return fail(lastError);
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
  if (!handle || !input.accessSecret) {
    return fail("Bluesky credentials incomplete. Reconnect the account.");
  }
  if (input.mediaUrl) {
    return fail("Bluesky DMs do not support attachments yet.");
  }
  const session = await blueskySession(
    input.accountId ?? handle,
    handle,
    input.accessSecret,
  );
  if (!session) {
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

const TT_BM = "https://business-api.tiktok.com/open_api/v1.3";

async function replyTikTok(input: DmReplyInput): Promise<DmReplyResult> {
  if (!input.conversationId) return fail("Missing TikTok conversation.");
  if (!input.platformUserId) return fail("Missing TikTok business id.");

  let imageMediaId: string | undefined;
  if (input.mediaUrl && input.mediaMimeType) {
    if (!input.mediaMimeType.startsWith("image/")) {
      return fail("TikTok DMs only accept images.");
    }
    const fileRes = await fetch(input.mediaUrl);
    if (!fileRes.ok) return fail("Could not fetch the image to send.");
    const blob = await fileRes.blob();
    const form = new FormData();
    form.append("business_id", input.platformUserId);
    form.append("file", blob, "inbox.jpg");
    form.append("media_type", "IMAGE");
    const uploadRes = await fetch(`${TT_BM}/business/message/media/upload/`, {
      method: "POST",
      headers: { "Access-Token": input.accessToken },
      body: form,
    });
    const uploaded = (await uploadRes.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: { media_id?: string };
    };
    if (!uploadRes.ok || uploaded.code !== 0 || !uploaded.data?.media_id) {
      return fail(uploaded.message ?? "TikTok image upload failed");
    }
    imageMediaId = uploaded.data.media_id;
  }

  const body: Record<string, unknown> = {
    business_id: input.platformUserId,
    recipient_type: "CONVERSATION",
    recipient: input.conversationId,
    message_type: imageMediaId ? "IMAGE" : "TEXT",
  };
  if (input.text.trim()) body.text = { body: input.text.trim() };
  if (imageMediaId) body.image = { media_id: imageMediaId };
  if (!input.text.trim() && !imageMediaId) return fail("Message is empty.");

  const res = await fetch(`${TT_BM}/business/message/send/`, {
    method: "POST",
    headers: {
      "Access-Token": input.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: { message?: { message_id?: string } };
  };
  if (!res.ok || data.code !== 0) {
    return fail(
      data.message ??
        "TikTok send failed. DMs need Business Messaging (not Login Kit; unavailable in US/EEA/UK).",
    );
  }
  return { ok: true, messageId: data.data?.message?.message_id };
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
    case "instagram":
      return replyInstagram(input);
    case "twitter_x":
      return replyTwitter(input);
    case "bluesky":
      return replyBluesky(input);
    case "tiktok":
      return replyTikTok(input);
    default:
      return fail(`DMs are not supported for ${input.platform}.`);
  }
}
