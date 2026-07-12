/**
 * X/Twitter v1.1 media upload via fetch + OAuth 1.0a.
 * CF Workers cannot use twitter-api-v2 uploadMedia (Node https.request / unenv).
 */
import crypto from "crypto";
import OAuth from "oauth-1.0a";
import { parseTwitterError } from "./twitter-errors.js";

const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";
const CHUNK_SIZE = 5 * 1024 * 1024;

export function isPublishWorkerRuntime(): boolean {
  return process.env.SOCIAL0_PUBLISH_WORKER === "1";
}

function getOAuth(): OAuth {
  const consumerKey = process.env.TWITTER_CONSUMER_KEY;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error("Twitter consumer key/secret not configured");
  }
  return new OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base: string, key: string) {
      return crypto.createHmac("sha1", key).update(base).digest("base64");
    },
  });
}

function oauthHeader(
  url: string,
  method: string,
  data: Record<string, string>,
  accessToken: string,
  accessSecret: string,
): Record<string, string> {
  const oauth = getOAuth();
  return oauth.toHeader(
    oauth.authorize({ url, method, data }, { key: accessToken, secret: accessSecret }),
  ) as unknown as Record<string, string>;
}

function mediaIdFromResponse(data: Record<string, unknown>): string {
  const id = data.media_id_string ?? data.media_id;
  if (id == null || id === "") {
    throw new Error("Twitter upload response missing media_id");
  }
  return String(id);
}

async function throwTwitterUploadError(
  res: Response,
  data: Record<string, unknown>,
): Promise<never> {
  const msg = parseTwitterError(data, res.status);
  throw new Error(msg);
}

async function postUrlEncoded(
  params: Record<string, string>,
  accessToken: string,
  accessSecret: string,
): Promise<Record<string, unknown>> {
  const headers = {
    ...oauthHeader(UPLOAD_URL, "POST", params, accessToken, accessSecret),
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers,
    body: new URLSearchParams(params),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) await throwTwitterUploadError(res, data);
  return data;
}

async function postAppendChunk(
  mediaId: string,
  segmentIndex: number,
  chunk: Uint8Array,
  accessToken: string,
  accessSecret: string,
): Promise<void> {
  const signParams = {
    command: "APPEND",
    media_id: mediaId,
    segment_index: String(segmentIndex),
  };
  const form = new FormData();
  form.append("command", "APPEND");
  form.append("media_id", mediaId);
  form.append("segment_index", String(segmentIndex));
  form.append("media", new Blob([chunk]), "media");

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: oauthHeader(UPLOAD_URL, "POST", signParams, accessToken, accessSecret),
    body: form,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    await throwTwitterUploadError(res, data);
  }
}

type ProcessingInfo = {
  state?: string;
  error?: { message?: string };
  check_after_secs?: number;
};

function readProcessingInfo(data: Record<string, unknown>): ProcessingInfo | undefined {
  const pi = data.processing_info;
  if (pi && typeof pi === "object") return pi as ProcessingInfo;
  return undefined;
}

async function waitForVideoProcessing(
  mediaId: string,
  accessToken: string,
  accessSecret: string,
  initial?: ProcessingInfo,
): Promise<void> {
  let info = initial;
  let attempts = 0;
  while (info?.state === "pending" || info?.state === "in_progress") {
    if (attempts >= 60) {
      throw new Error("Video processing timeout - video is still being processed");
    }
    const waitMs = (info.check_after_secs ?? 3) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const status = await postUrlEncoded(
      { command: "STATUS", media_id: mediaId },
      accessToken,
      accessSecret,
    );
    info = readProcessingInfo(status);
    if (info?.state === "failed") {
      throw new Error(`Video processing failed: ${info.error?.message ?? "Unknown error"}`);
    }
    attempts++;
  }
  if (info?.state === "failed") {
    throw new Error(`Video processing failed: ${info.error?.message ?? "Unknown error"}`);
  }
}

/** Simple upload for images (Worker-safe). */
export async function uploadTwitterImageFetch(
  imageBuffer: Buffer,
  mimeType: string,
  accessToken: string,
  accessSecret: string,
): Promise<string> {
  void mimeType;
  const data = await postUrlEncoded(
    { media_data: imageBuffer.toString("base64") },
    accessToken,
    accessSecret,
  );
  return mediaIdFromResponse(data);
}

/** Chunked upload for videos (Worker-safe). */
export async function uploadTwitterVideoFetch(
  videoBuffer: Buffer,
  mimeType: string,
  accessToken: string,
  accessSecret: string,
): Promise<string> {
  const init = await postUrlEncoded(
    {
      command: "INIT",
      media_type: mimeType,
      total_bytes: String(videoBuffer.length),
      media_category: "tweet_video",
    },
    accessToken,
    accessSecret,
  );
  const mediaId = mediaIdFromResponse(init);

  let segment = 0;
  for (let offset = 0; offset < videoBuffer.length; offset += CHUNK_SIZE) {
    const chunk = videoBuffer.subarray(offset, offset + CHUNK_SIZE);
    await postAppendChunk(mediaId, segment, chunk, accessToken, accessSecret);
    segment++;
  }

  const finalized = await postUrlEncoded(
    { command: "FINALIZE", media_id: mediaId },
    accessToken,
    accessSecret,
  );
  await waitForVideoProcessing(
    mediaId,
    accessToken,
    accessSecret,
    readProcessingInfo(finalized),
  );
  return mediaId;
}
