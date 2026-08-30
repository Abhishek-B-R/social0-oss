/** Send a DM on the originating platform. */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";
import { jsonPost } from "../http-json.js";
import { uploadTwitterImage, uploadTwitterVideo } from "../twitter-media.js";
import { inboxAllowsMedia } from "./media-capabilities.js";
import { blueskySession, blueskySessionAfter401 } from "./bluesky-session.js";
import {
  tiktokBmData,
  tiktokBmErrorMessage,
  tiktokBmMediaId,
  tiktokBmPost,
  tiktokBmSentMessageId,
  tiktokBmUploadImage,
} from "./tiktok-bm.js";

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
      error: graphError(data, "Could not upload attachment - ensure media URL is public HTTPS."),
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

  // Graph rejects text + attachment in one payload - send separately.
  if (hasText && hasMedia) {
    const mediaResult = await postMessage({
      attachment: graphAttachment(input.mediaUrl!, input.mediaMimeType!),
    });
    if (mediaResult.ok) return postMessage({ text: input.text.trim() });
    // URL attachment failed - fall through to attachment_id retry.
  } else {
    const message: Record<string, unknown> = {};
    if (hasText) message.text = input.text.trim();
    if (hasMedia) {
      message.attachment = graphAttachment(input.mediaUrl!, input.mediaMimeType!);
    }
    const result = await postMessage(message);
    if (result.ok || !hasMedia) return result;
  }

  const type = input.mediaMimeType!.startsWith("video/") ? "video" : "image";
  const uploadHosts: Array<"graph.facebook.com" | "graph.instagram.com"> = [host];

  let lastError = "Message with attachment failed";
  for (const uploadHost of uploadHosts) {
    const uploaded = await graphUploadAttachmentId(
      uploadHost,
      input.platformUserId,
      input.accessToken,
      input.mediaUrl!,
      input.mediaMimeType!,
    );
    if ("error" in uploaded) {
      lastError = uploaded.error;
      continue;
    }
    const retry = await postMessage({
      attachment: { type, payload: { attachment_id: uploaded.id } },
    });
    if (retry.ok) {
      if (hasText) return postMessage({ text: input.text.trim() });
      return retry;
    }
    lastError = retry.error ?? lastError;
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
  if (!input.conversationId && !input.peerId) {
    return fail("Missing recipient for this X conversation.");
  }
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
    // Group threads must use the conversation id - with/:peerId is 1:1 create-or-send.
    const path = input.conversationId
      ? `dm_conversations/${encodeURIComponent(input.conversationId)}/messages`
      : `dm_conversations/with/${encodeURIComponent(input.peerId)}/messages`;
    const raw = await client.v2.post(path, body);
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
  const accountKey = input.accountId ?? handle;
  const send = async (accessJwt: string) =>
    fetch("https://api.bsky.chat/xrpc/chat.bsky.convo.sendMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessJwt}`,
        "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        convoId: input.conversationId,
        message: { text: input.text },
      }),
    });

  let session = await blueskySession(accountKey, handle, input.accessSecret);
  if (!session) {
    return fail("Bluesky login failed. Reconnect the account.");
  }
  let res = await send(session.accessJwt);
  if (res.status === 401) {
    session = await blueskySessionAfter401(accountKey, handle, input.accessSecret);
    if (!session) return fail("Bluesky login failed. Reconnect the account.");
    res = await send(session.accessJwt);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return fail((data as { message?: string })?.message ?? "Bluesky DM failed");
  }
  const id = (data as { id?: string })?.id;
  return { ok: true, messageId: id };
}

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
    const buf = await fileRes.arrayBuffer();
    const mime = input.mediaMimeType.split(";")[0]?.trim() || "image/jpeg";
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const blob = new Blob([buf], { type: mime });
    const uploaded = await tiktokBmUploadImage(
      input.accessToken,
      input.platformUserId,
      blob,
      `inbox.${ext}`,
    );
    const mediaId = tiktokBmMediaId(tiktokBmData(uploaded.data));
    if (!uploaded.ok || !mediaId) {
      return fail(
        tiktokBmErrorMessage(uploaded.data, "TikTok image upload failed"),
      );
    }
    imageMediaId = mediaId;
  }

  const caption = input.text.trim();
  if (!caption && !imageMediaId) return fail("Message is empty.");

  const sendBm = (body: Record<string, unknown>) =>
    tiktokBmPost(input.accessToken, "/business/message/send/", {
      business_id: input.platformUserId,
      recipient_type: "CONVERSATION",
      recipient: input.conversationId,
      ...body,
    });

  // BM is one message_type per call - image+caption must be two sends.
  let lastId: string | undefined;
  if (imageMediaId) {
    const imageSend = await sendBm({
      message_type: "IMAGE",
      image: { media_id: imageMediaId },
    });
    if (!imageSend.ok) {
      return fail(tiktokBmErrorMessage(imageSend.data, "TikTok send failed"));
    }
    lastId = tiktokBmSentMessageId(tiktokBmData(imageSend.data));
  }
  if (caption) {
    const textSend = await sendBm({
      message_type: "TEXT",
      text: { body: caption },
    });
    if (!textSend.ok) {
      return fail(tiktokBmErrorMessage(textSend.data, "TikTok send failed"));
    }
    lastId = tiktokBmSentMessageId(tiktokBmData(textSend.data)) ?? lastId;
  }
  return { ok: true, messageId: lastId };
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
