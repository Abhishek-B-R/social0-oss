/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Platform-specific publish logic for Facebook, Bluesky, YouTube,
 * Pinterest, Instagram, TikTok, and Threads.
 * Uses validation and allowlisted media URLs for security.
 */

import { db } from "../db/index.js";
import { mediaUploads } from "../db/schema.js";
import { inArray } from "drizzle-orm";
import {
  getAllowedMediaOrigins,
  isAllowedMediaUrl,
  validateContentLength,
  validateMediaCount,
  truncate,
} from "./publish-validation.js";
import { getValidToken } from "./token-refresh.js";
import {
  processImageForTikTok,
  TikTokImageError,
} from "./tiktok-photo-process.js";
import { resolveTikTokProfileUrl, resolveInstagramProfileUrl } from "./platform-view-url.js";
import { fetchWithTimeout } from "./fetch-with-timeout.js";
import sharp from "sharp";

export type PublishPlatformResult = {
  status: "published" | "failed";
  platformPostUrl?: string | null;
  platformPostId?: string | null;
  publishedAt?: Date | null;
  lastError?: string | null;
  error?: string;
};

type Pub = {
  publicationId: string;
  connectedAccountId: string;
  platform: string;
  platformUserId: string;
  platformUsername: string | null;
  platformMetadata: Record<string, unknown> | null;
};

type Post = {
  id: string;
  finalContent: string | null;
  mediaIds: string[] | null;
  metadata?: Record<string, unknown> | null;
};

/** Runtime options per platform (not persisted). */
export type PlatformPublishOptions = {
  instagram?: {
    coverImageUrl?: string;
    isTrialReel: boolean;
  };
  tiktok?: TikTokPlatformOptions;
};

export type ThreadPart = { text: string; mediaIds: string[] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry fetch on network errors (e.g. ECONNRESET). Does not retry on HTTP 4xx/5xx. */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 1000;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (e) {
      lastError = e;
      const err = e as Error & { cause?: { code?: string } };
      const isNetwork =
        err.message?.includes("fetch failed") ||
        err.cause?.code === "ECONNRESET" ||
        err.cause?.code === "ECONNREFUSED";
      if (attempt < retries && isNetwork) {
        await sleep(delayMs);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

/** Build application/x-www-form-urlencoded body. Threads API expects form data, not JSON. */
function threadsFormBody(
  params: Record<string, string | boolean | undefined>,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    p.set(k, typeof v === "boolean" ? (v ? "true" : "false") : v);
  }
  return p.toString();
}

/**
 * Published media id from POST .../threads_publish (Graph JSON).
 * Prefer string ids — large numeric JSON ids can lose precision in JS.
 */
function parseThreadsPublishId(data: unknown): string | null {
  if (data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const id = o.id;
  if (typeof id === "string" && id.trim().length > 0) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) {
    return String(Math.trunc(id));
  }
  const nested = o.data;
  if (nested != null && typeof nested === "object") {
    const inner = (nested as Record<string, unknown>).id;
    if (typeof inner === "string" && inner.trim().length > 0) return inner.trim();
  }
  return null;
}

/** Threads shortcode charset (+ and _). */
const THREADS_SHORTCODE_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+_";

/**
 * Encode numeric media ID to shortcode (base-64 style, 64-char alphabet).
 * Returns "" if id is invalid or charset is not length 64.
 */
function mediaIdToShortcode(id: string | number, charset: string): string {
  if (charset.length !== 64) return "";
  const idStr =
    typeof id === "number" ? String(Math.floor(id)) : String(id).trim();
  if (!idStr) return "";
  let n: bigint;
  try {
    n = BigInt(idStr);
  } catch {
    return "";
  }
  const zero = BigInt(0);
  const sixtyFour = BigInt(64);
  if (n <= zero) return "";
  let result = "";
  while (n > zero) {
    const remainder = n % sixtyFour;
    result = charset[Number(remainder)] + result;
    n = (n - remainder) / sixtyFour;
  }
  return result;
}

function threadsMediaIdToShortcode(id: string | number): string {
  const s = mediaIdToShortcode(id, THREADS_SHORTCODE_CHARSET);
  return s || "";
}

export function getThreadParts(post: Post): ThreadPart[] | null {
  const md = post.metadata;
  if (!md || typeof md !== "object") return null;
  const tw = (md as Record<string, unknown>)["twitterThread"];
  if (!tw || typeof tw !== "object") return null;
  const partsVal = (tw as Record<string, unknown>)["parts"];
  if (!Array.isArray(partsVal) || partsVal.length === 0) return null;
  const parts: ThreadPart[] = [];
  for (const p of partsVal) {
    if (!p || typeof p !== "object") return null;
    const text = (p as Record<string, unknown>)["text"];
    const mediaIds = (p as Record<string, unknown>)["mediaIds"];
    parts.push({
      text: typeof text === "string" ? text : "",
      mediaIds: Array.isArray(mediaIds)
        ? mediaIds.filter((id): id is string => typeof id === "string")
        : [],
    });
  }
  return parts;
}

export async function publishToPlatform(
  pub: Pub,
  post: Post,
  accessToken: string,
  accessSecret: string | null,
  platformOptions?: PlatformPublishOptions,
): Promise<PublishPlatformResult> {
  const mediaCountErr = validateMediaCount(post.mediaIds ?? null);
  if (mediaCountErr) {
    return { status: "failed", lastError: mediaCountErr, error: mediaCountErr };
  }
  const contentErr = validateContentLength(
    pub.platform,
    post.finalContent ?? "",
  );
  if (contentErr) {
    return { status: "failed", lastError: contentErr, error: contentErr };
  }
  let result: PublishPlatformResult;

  switch (pub.platform) {
    case "facebook":
      result = await publishToFacebook(pub, post, accessToken);
      break;
    case "bluesky":
      result = await publishToBluesky(pub, post, accessToken, accessSecret);
      break;
    case "youtube":
      result = await publishToYouTube(pub, post, accessToken);
      break;
    case "pinterest":
      result = await publishToPinterest(pub, post, accessToken);
      break;
    case "instagram":
      result = await publishToInstagram(
        pub,
        post,
        accessToken,
        platformOptions?.instagram,
      );
      break;
    case "tiktok":
      result = await publishToTikTok(
        pub,
        post,
        accessToken,
        platformOptions?.tiktok,
      );
      break;
    case "threads":
      result = await publishToThreads(pub, post, accessToken);
      break;
    default:
      result = {
        status: "failed",
        lastError: "Unknown platform",
        error: "Unknown platform",
      };
      break;
  }

  console.log(
    `[publishToPlatform] ${pub.platform} final result:`,
    JSON.stringify(result),
  );

  return result;
}

/**
 * Resolve a Bluesky/ATProto DID to the account's PDS URL and PDS DID.
 * Required for service auth: the token audience must be the user's PDS DID.
 */
async function resolveDidToPds(
  did: string,
): Promise<{ pdsUrl: string; pdsDid: string } | null> {
  try {
    let docUrl: string;
    if (did.startsWith("did:plc:")) {
      docUrl = `https://plc.directory/${encodeURIComponent(did)}`;
    } else if (did.startsWith("did:web:")) {
      const hostname = did.replace("did:web:", "").replace(/:/g, "%3A");
      docUrl = `https://${hostname}/.well-known/did.json`;
    } else {
      return null;
    }
    const res = await fetch(docUrl);
    if (!res.ok) return null;
    const doc = (await res.json()) as {
      service?: Array<{
        id?: string;
        type?: string;
        serviceEndpoint?: string;
      }>;
    };
    const pdsService = doc.service?.find(
      (s) =>
        s.type === "AtprotoPersonalDataServer" &&
        (s.id === "#atproto_pds" || s.id?.endsWith("#atproto_pds")),
    );
    const endpoint = pdsService?.serviceEndpoint;
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://"))
      return null;
    const pdsHost = new URL(endpoint).hostname;
    const pdsDid = `did:web:${pdsHost}`;
    const pdsUrl = endpoint.replace(/\/$/, "");
    return { pdsUrl, pdsDid };
  } catch {
    return null;
  }
}

/** Publish a Bluesky thread (reply chain). Returns null to fall back to single-post. */
async function publishBlueskyThread(
  pub: Pub,
  parts: ThreadPart[],
  handle: string,
  jwt: string,
  did: string,
): Promise<PublishPlatformResult | null> {
  const BLUESKY_MAX_TEXT = 3000;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].text.length > BLUESKY_MAX_TEXT) {
      return {
        status: "failed",
        lastError: `Bluesky thread part ${i + 1} is over ${BLUESKY_MAX_TEXT} characters.`,
        error: "Content too long",
      };
    }
  }

  let rootRef: { uri: string; cid: string } | null = null;
  let parentRef: { uri: string; cid: string } | null = null;

  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    const media =
      part.mediaIds.length > 0 ? await getMediaWithUrls(part.mediaIds) : [];
    const images = media
      .filter((m) => m.mimeType.startsWith("image/"))
      .slice(0, 4);
    const videos = media.filter((m) => m.mimeType.startsWith("video/"));

    const imageBlobs: Array<{ alt: string; image: unknown }> = [];
    for (const img of images) {
      try {
        const imageBuffer = await fetchMediaBytes(img.url);
        const { buffer, contentType } = await prepareImageForPlatform(
          imageBuffer,
          "bluesky",
          img.mimeType,
        );
        const uploadRes = await fetch(
          "https://bsky.social/xrpc/com.atproto.repo.uploadBlob",
          {
            method: "POST",
            headers: {
              "Content-Type": contentType,
              Authorization: `Bearer ${jwt}`,
            },
            body: new Uint8Array(buffer),
          },
        );
        if (uploadRes.ok) {
          const uploadData = (await uploadRes.json()) as { blob?: unknown };
          if (uploadData.blob)
            imageBlobs.push({ alt: "", image: uploadData.blob });
        }
      } catch {
        // skip failed image
      }
    }

    let videoBlob: unknown | null = null;
    if (videos.length > 0) {
      const video = videos[0];
      try {
        const videoBuffer = await fetchMediaBytes(video.url);
        const pds = await resolveDidToPds(did);
        if (!pds) break;
        const serviceAuthUrl = new URL(
          `${pds.pdsUrl}/xrpc/com.atproto.server.getServiceAuth`,
        );
        serviceAuthUrl.searchParams.set("aud", pds.pdsDid);
        serviceAuthUrl.searchParams.set("lxm", "com.atproto.repo.uploadBlob");
        const serviceAuthRes = await fetch(serviceAuthUrl.toString(), {
          method: "GET",
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (!serviceAuthRes.ok) break;
        const serviceAuth = (await serviceAuthRes.json()) as { token?: string };
        if (!serviceAuth.token) break;
        const uploadRes = await fetch(
          `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(did)}&name=thread-video.mp4`,
          {
            method: "POST",
            headers: {
              "Content-Type": "video/mp4",
              "Content-Length": String(videoBuffer.byteLength),
              Authorization: `Bearer ${serviceAuth.token}`,
            },
            body: videoBuffer,
          },
        );
        const uploadData = (await uploadRes.json().catch(() => ({}))) as {
          blob?: unknown;
          jobId?: string;
        };
        if (uploadData.blob) videoBlob = uploadData.blob;
        else if (uploadData.jobId) {
          for (let r = 0; r < 45; r++) {
            await new Promise((x) => setTimeout(x, 2000));
            const statusRes = await fetch(
              `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?did=${encodeURIComponent(did)}&jobId=${encodeURIComponent(uploadData.jobId!)}`,
              { headers: { Authorization: `Bearer ${serviceAuth.token}` } },
            );
            if (!statusRes.ok) break;
            const statusData = (await statusRes.json()) as {
              blob?: unknown;
              jobStatus?: { state?: string; blob?: unknown };
            };
            const state = statusData.jobStatus?.state;
            if (
              state === "JOB_STATE_COMPLETED" &&
              (statusData.blob ?? statusData.jobStatus?.blob)
            ) {
              videoBlob = statusData.blob ?? statusData.jobStatus?.blob;
              break;
            }
            if (state === "JOB_STATE_FAILED") break;
          }
        }
      } catch {
        // skip video for this part
      }
    }

    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text: part.text || "",
      createdAt: new Date().toISOString(),
    };
    if (videoBlob) {
      record.embed = {
        $type: "app.bsky.embed.video",
        video: videoBlob,
        alt: part.text || "",
      };
    } else if (imageBlobs.length > 0) {
      record.embed = {
        $type: "app.bsky.embed.images",
        images: imageBlobs,
      };
    }
    if (rootRef && parentRef) {
      record.reply = { root: rootRef, parent: parentRef };
    }

    const createRes = await fetch(
      "https://bsky.social/xrpc/com.atproto.repo.createRecord",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          repo: did,
          collection: "app.bsky.feed.post",
          record,
        }),
      },
    );
    const createData = (await createRes.json().catch(() => ({}))) as {
      uri?: string;
      cid?: string;
      message?: string;
      error?: string;
    };
    if (!createRes.ok || !createData.uri) {
      const err =
        createData.message ?? createData.error ?? "Bluesky thread post failed";
      return { status: "failed", lastError: err, error: err };
    }
    const cid = createData.cid ?? "";
    const ref = { uri: createData.uri, cid };
    if (partIndex === 0) {
      rootRef = ref;
      parentRef = ref;
    } else {
      parentRef = ref;
    }
  }

  if (!rootRef) {
    return {
      status: "failed",
      lastError: "Bluesky thread could not be created.",
      error: "Thread failed",
    };
  }
  const rkey = rootRef.uri.split("/").pop();
  const platformPostUrl = rkey
    ? `https://bsky.app/profile/${handle}/post/${rkey}`
    : rootRef.uri;
  return {
    status: "published",
    platformPostId: rootRef.uri,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

/** Fetch media by IDs; only return URLs that are on our allowlist (SSRF protection). */
async function getMediaWithUrls(
  mediaIds: string[],
): Promise<{ url: string; mimeType: string }[]> {
  const allowed = getAllowedMediaOrigins();
  if (!allowed.appUrl) return [];
  const media = await db
    .select({ url: mediaUploads.url, mimeType: mediaUploads.mimeType })
    .from(mediaUploads)
    .where(inArray(mediaUploads.id, mediaIds));
  return media.filter((m): m is { url: string; mimeType: string } => {
    if (!m.url || !m.mimeType) return false;
    return isAllowedMediaUrl(m.url, allowed);
  });
}

/** Fetch media by IDs with thumbnailUrl for videos (for Pinterest video pin cover). */
async function getMediaWithUrlsAndThumbnail(
  mediaIds: string[],
): Promise<{ url: string; mimeType: string; thumbnailUrl: string | null }[]> {
  const allowed = getAllowedMediaOrigins();
  if (!allowed.appUrl || !mediaIds.length) return [];
  const media = await db
    .select({
      url: mediaUploads.url,
      mimeType: mediaUploads.mimeType,
      thumbnailUrl: mediaUploads.thumbnailUrl,
    })
    .from(mediaUploads)
    .where(inArray(mediaUploads.id, mediaIds));
  return media.filter(
    (
      m,
    ): m is { url: string; mimeType: string; thumbnailUrl: string | null } => {
      if (!m.url || !m.mimeType) return false;
      if (!isAllowedMediaUrl(m.url, allowed)) return false;
      if (
        m.thumbnailUrl != null &&
        m.thumbnailUrl !== "" &&
        !isAllowedMediaUrl(m.thumbnailUrl, allowed)
      )
        return false;
      return true;
    },
  );
}

/** Fetch media by IDs in the same order as mediaIds; only allowlisted URLs. Used for collection/carousel. */
async function getOrderedMediaWithUrls(
  mediaIds: string[],
): Promise<{ id: string; url: string; mimeType: string }[]> {
  const allowed = getAllowedMediaOrigins();
  if (!allowed.appUrl || !mediaIds.length) return [];
  const media = await db
    .select({
      id: mediaUploads.id,
      url: mediaUploads.url,
      mimeType: mediaUploads.mimeType,
    })
    .from(mediaUploads)
    .where(inArray(mediaUploads.id, mediaIds));
  const filtered = media.filter(
    (m): m is { id: string; url: string; mimeType: string } => {
      if (!m.url || !m.mimeType) return false;
      return isAllowedMediaUrl(m.url, allowed);
    },
  );
  const order = new Map(mediaIds.map((id, i) => [id, i]));
  return filtered
    .slice()
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

const MEDIA_FETCH_TIMEOUT_MS = 60_000;
const MEDIA_FETCH_RETRIES = 2;

/** Platform image size limits (bytes) for server-side compression before upload. Keys match platform ids. */
const PLATFORM_IMAGE_LIMITS: Record<string, number> = {
  twitter_x: 5 * 1024 * 1024,
  instagram: 8 * 1024 * 1024,
  facebook: 30 * 1024 * 1024,
  linkedin: 8 * 1024 * 1024,
  tiktok: 8 * 1024 * 1024,
  pinterest: 20 * 1024 * 1024,
  bluesky: 976 * 1024, // API blob limit ~976.56KB
  threads: 8 * 1024 * 1024,
  youtube: 2 * 1024 * 1024,
};

const DEFAULT_IMAGE_LIMIT = 8 * 1024 * 1024;

/**
 * Prepare image for platform API upload: return as-is if under platform limit,
 * else compress (and resize if needed) to fit. Use when uploading raw bytes to the API.
 */
async function prepareImageForPlatform(
  imageBuffer: ArrayBuffer,
  platform: string,
  mimeType?: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const limit = PLATFORM_IMAGE_LIMITS[platform] ?? DEFAULT_IMAGE_LIMIT;
  const buf = Buffer.from(imageBuffer);

  if (buf.length <= limit) {
    return {
      buffer: buf,
      contentType: mimeType?.startsWith("image/") ? mimeType : "image/jpeg",
    };
  }

  let quality = 85;
  let output = await sharp(buf)
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (output.length > limit && quality >= 30) {
    quality -= 10;
    output = await sharp(buf)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  if (output.length > limit) {
    output = await sharp(buf)
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
  }

  return { buffer: output, contentType: "image/jpeg" };
}

/** Fetch media URL with long timeout and retries so scheduled publish can reach our media server. */
async function fetchMediaBytes(
  url: string,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<ArrayBuffer> {
  const timeoutMs = options.timeoutMs ?? MEDIA_FETCH_TIMEOUT_MS;
  const retries = options.retries ?? MEDIA_FETCH_RETRIES;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.arrayBuffer();
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    } finally {
      clearTimeout(id);
    }
  }
  throw lastError;
}

async function publishToFacebook(
  pub: Pub,
  post: Post,
  pageAccessToken: string,
): Promise<PublishPlatformResult> {
  const pageId = pub.platformUserId;
  const message = post.finalContent?.trim() ?? "";
  if (!message) {
    return {
      status: "failed",
      lastError: "Post content is empty",
      error: "Post content is empty",
    };
  }

  const media = post.mediaIds?.length
    ? await getMediaWithUrls(post.mediaIds)
    : [];
  const images = media.filter((m) => m.mimeType.startsWith("image/"));
  const firstVideo = media.find((m) => m.mimeType.startsWith("video/"));

  let data: { id?: string; post_id?: string; error?: { message?: string } };
  let isVideo = false;
  let postId: string | undefined;

  // Handle multi-photo posts (2+ images)
  if (images.length > 1) {
    console.log(
      `📸 Creating Facebook multi-photo post with ${images.length} images...`,
    );

    // Upload all photos as unpublished first
    const photoIds: Array<{ media_fbid: string }> = [];

    for (const img of images.slice(0, 10)) {
      const photoRes = await fetchWithRetry(
        `https://graph.facebook.com/v21.0/${pageId}/photos`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pageAccessToken}`,
          },
          body: JSON.stringify({
            url: img.url,
            published: false,
          }),
        },
        { retries: 2, delayMs: 1000 },
      );

      const photoData = (await photoRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };

      if (photoRes.ok && photoData.id) {
        photoIds.push({ media_fbid: photoData.id });
        console.log(`✅ Photo ${photoIds.length} uploaded: ${photoData.id}`);
      } else {
        console.error(`❌ Failed to upload photo:`, photoData.error);
      }
    }

    if (photoIds.length === 0) {
      return {
        status: "failed",
        lastError: "Failed to upload photos for multi-photo post",
        error: "Upload failed",
      };
    }

    // Create multi-photo post
    const postRes = await fetchWithRetry(
      `https://graph.facebook.com/v21.0/${pageId}/feed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pageAccessToken}`,
        },
        body: JSON.stringify({
          message: message,
          attached_media: photoIds,
        }),
      },
      { retries: 2, delayMs: 1000 },
    );

    data = (await postRes.json().catch(() => ({}))) as {
      id?: string;
      post_id?: string;
      error?: { message?: string };
    };

    if (!postRes.ok) {
      let err = data.error?.message ?? `HTTP ${postRes.status}`;
      if (err.includes("must be granted") || err.includes("impersonating")) {
        err =
          "Facebook needs updated permissions. Please disconnect and reconnect your Facebook Page from the dashboard so the app can request the required access.";
      }
      console.error("Facebook multi-photo post failed:", {
        status: postRes.status,
        error: data.error,
      });
      return { status: "failed", lastError: err, error: err };
    }

    postId = data.post_id ?? data.id?.split("_")[1] ?? data.id;
  } else if (images.length === 1) {
    // Single image
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      url: images[0].url,
      caption: message,
    });

    const res = await fetchWithRetry(
      `https://graph.facebook.com/v21.0/${pageId}/photos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
      { retries: 2, delayMs: 1000 },
    );

    data = (await res.json().catch(() => ({}))) as {
      id?: string;
      post_id?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      let err = data.error?.message ?? `HTTP ${res.status}`;
      if (err.includes("must be granted") || err.includes("impersonating")) {
        err =
          "Facebook needs updated permissions. Please disconnect and reconnect your Facebook Page from the dashboard so the app can request the required access.";
      }
      return { status: "failed", lastError: err, error: err };
    }

    postId = data.post_id ?? data.id?.split("_")[1] ?? data.id;
  } else if (firstVideo?.url) {
    // Single video
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      file_url: firstVideo.url,
      description: message,
    });

    const res = await fetchWithRetry(
      `https://graph-video.facebook.com/v21.0/${pageId}/videos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
      { retries: 2, delayMs: 1000 },
    );

    data = (await res.json().catch(() => ({}))) as {
      id?: string;
      post_id?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      let err = data.error?.message ?? `HTTP ${res.status}`;
      if (err.includes("must be granted") || err.includes("impersonating")) {
        err =
          "Facebook needs updated permissions. Please disconnect and reconnect your Facebook Page from the dashboard so the app can request the required access.";
      }
      return { status: "failed", lastError: err, error: err };
    }

    isVideo = true;
    postId = data.post_id ?? data.id?.split("_")[1] ?? data.id;
  } else {
    // Text-only post
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      message: message,
    });

    const res = await fetchWithRetry(
      `https://graph.facebook.com/v21.0/${pageId}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
      { retries: 2, delayMs: 1000 },
    );

    data = (await res.json().catch(() => ({}))) as {
      id?: string;
      post_id?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      let err = data.error?.message ?? `HTTP ${res.status}`;
      if (err.includes("must be granted") || err.includes("impersonating")) {
        err =
          "Facebook needs updated permissions. Please disconnect and reconnect your Facebook Page from the dashboard so the app can request the required access.";
      }
      return { status: "failed", lastError: err, error: err };
    }

    postId = data.post_id ?? data.id?.split("_")[1] ?? data.id;
  }

  const platformPostUrl = postId
    ? isVideo
      ? `https://www.facebook.com/${pageId}/videos/${postId}/`
      : `https://www.facebook.com/${pageId}/posts/${postId}`
    : null;

  return {
    status: "published",
    platformPostId: data.id ?? postId ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

async function publishToBluesky(
  pub: Pub,
  post: Post,
  handle: string,
  appPassword: string | null,
): Promise<PublishPlatformResult> {
  try {
    const contentType = (
      post.metadata as Record<string, unknown> | null | undefined
    )?.["contentType"];
    if (contentType === "collection") {
      const err =
        "Collection posts not supported on Bluesky — use Image Post or Video Post instead.";
      return { status: "failed", lastError: err, error: err };
    }

    if (!appPassword) {
      return {
        status: "failed",
        lastError: "Bluesky app password missing. Reconnect the account.",
        error: "Bluesky app password missing",
      };
    }

    // Create session
    const sessionRes = await fetch(
      "https://bsky.social/xrpc/com.atproto.server.createSession",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: handle, password: appPassword }),
      },
    );

    if (!sessionRes.ok) {
      const errData = await sessionRes.json().catch(() => ({}));
      const err =
        (errData as { message?: string }).message ?? "Bluesky login failed";
      return { status: "failed", lastError: err, error: err };
    }

    const session = (await sessionRes.json()) as {
      accessJwt: string;
      did: string;
    };
    const jwt = session.accessJwt;
    const did = session.did;

    const threadParts = getThreadParts(post);
    if (threadParts && threadParts.length > 0) {
      const threadResult = await publishBlueskyThread(
        pub,
        threadParts,
        handle,
        jwt,
        did,
      );
      if (threadResult) return threadResult;
    }

    const text = post.finalContent?.trim() ?? "";
    if (text.length > 3000) {
      return {
        status: "failed",
        lastError: "Bluesky post must be 3000 characters or less",
        error: "Content too long",
      };
    }

    // Get media if present (collection: up to 4 total, any mix of images and videos in order)
    const orderedMedia = post.mediaIds?.length
      ? await getOrderedMediaWithUrls(post.mediaIds)
      : [];
    const images = orderedMedia.filter((m) => m.mimeType.startsWith("image/"));
    const videos = orderedMedia.filter((m) => m.mimeType.startsWith("video/"));
    const selectedImages = images.slice(0, 4);

    if (selectedImages.length > 0) {
      console.log(
        `Bluesky collection: posting ${selectedImages.length} images, ignoring ${videos.length} videos`,
      );
    }

    // Upload images and get blob refs (fetch with long timeout + retries so media server is reachable)
    const imageBlobs: Array<{ alt: string; image: unknown }> = [];
    for (const img of selectedImages) {
      try {
        const imageBuffer = await fetchMediaBytes(img.url);
        const { buffer, contentType } = await prepareImageForPlatform(
          imageBuffer,
          "bluesky",
          img.mimeType,
        );

        // Upload to Bluesky
        const uploadRes = await fetch(
          "https://bsky.social/xrpc/com.atproto.repo.uploadBlob",
          {
            method: "POST",
            headers: {
              "Content-Type": contentType,
              Authorization: `Bearer ${jwt}`,
            },
            body: new Uint8Array(buffer),
          },
        );

        if (uploadRes.ok) {
          const uploadData = (await uploadRes.json()) as {
            blob?: unknown;
          };
          if (uploadData.blob) {
            imageBlobs.push({
              alt: "",
              image: uploadData.blob,
            });
          }
        } else {
          const errorText = await uploadRes.text().catch(() => "Unknown error");
          console.warn(
            `Failed to upload blob for ${img.url}: ${uploadRes.status}`,
            errorText,
          );
        }
      } catch (error) {
        console.error(`Error processing image ${img.url}:`, error);
        // Continue with other images
      }
    }

    // Upload video and get blob ref (Bluesky supports one video per post, max 100MB).
    // Only use video mode when there are no images in the post.
    let videoBlob: unknown | null = null;
    if (videos.length > 0 && selectedImages.length === 0) {
      const video = videos[0]; // Bluesky supports one video per post
      try {
        const videoBuffer = await fetchMediaBytes(video.url);
        const maxVideoSize = 100 * 1024 * 1024; // 100MB
        if (videoBuffer.byteLength > maxVideoSize) {
          return {
            status: "failed",
            lastError: `Video is too large for Bluesky (max ${maxVideoSize / 1024 / 1024}MB). Video is ${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)}MB.`,
            error: "Video too large",
          };
        }

        // Step 1: Resolve user's DID to get their PDS (token audience must be PDS DID, not user DID)
        const pds = await resolveDidToPds(did);
        if (!pds) {
          return {
            status: "failed",
            lastError:
              "Could not resolve your Bluesky account's server. Video upload requires a resolvable DID.",
            error: "DID resolution failed",
          };
        }

        // Step 2: Get service auth token from the user's PDS (aud = PDS DID)
        const serviceAuthUrl = new URL(
          `${pds.pdsUrl}/xrpc/com.atproto.server.getServiceAuth`,
        );
        serviceAuthUrl.searchParams.set("aud", pds.pdsDid);
        serviceAuthUrl.searchParams.set("lxm", "com.atproto.repo.uploadBlob");

        const serviceAuthRes = await fetch(serviceAuthUrl.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        });

        if (!serviceAuthRes.ok) {
          const errorText = await serviceAuthRes
            .text()
            .catch(() => "Unknown error");
          console.error("Failed to get service auth:", errorText);
          return {
            status: "failed",
            lastError: `Failed to authenticate with Bluesky video service: ${errorText}`,
            error: "Service auth failed",
          };
        }

        const serviceAuth = (await serviceAuthRes.json()) as {
          token?: string;
        };

        if (!serviceAuth.token) {
          return {
            status: "failed",
            lastError: "Failed to get video service authentication token",
            error: "No service token",
          };
        }

        // Step 2: Upload video to Bluesky video service
        const videoFileName = video.url.split("/").pop() || "video.mp4";
        const uploadRes = await fetch(
          `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(did)}&name=${encodeURIComponent(videoFileName)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "video/mp4",
              "Content-Length": String(videoBuffer.byteLength),
              Authorization: `Bearer ${serviceAuth.token}`,
            },
            body: videoBuffer,
          },
        );

        let uploadData: { jobId?: string; blob?: unknown };
        if (!uploadRes.ok) {
          const errorData = (await uploadRes.json().catch(() => ({}))) as {
            error?: string;
            state?: string;
            jobId?: string;
            blob?: unknown;
            message?: string;
          };
          // If video already exists and is completed, use it or poll by jobId
          if (
            errorData.error === "already_exists" &&
            errorData.state === "JOB_STATE_COMPLETED"
          ) {
            console.log("Video already processed, using existing result");
            if (errorData.blob) {
              videoBlob = errorData.blob;
            }
            uploadData = {
              jobId: errorData.jobId,
              blob: errorData.blob,
            };
          } else {
            console.error(
              `Failed to upload video: ${uploadRes.status}`,
              errorData,
            );
            return {
              status: "failed",
              lastError:
                errorData.message ||
                `Failed to upload video to Bluesky: ${JSON.stringify(errorData)}`,
              error: "Video upload failed",
            };
          }
        } else {
          uploadData = (await uploadRes.json()) as {
            jobId?: string;
            blob?: unknown;
          };
        }

        // If we got blob from already_exists response, skip polling
        if (videoBlob) {
          // already handled above
        } else if (uploadData.blob) {
          videoBlob = uploadData.blob;
          console.log("✅ Video blob uploaded to Bluesky");
        } else if (uploadData.jobId) {
          // Step 3: Poll job status until video is processed
          console.log("⏳ Polling video processing status...");
          let retries = 0;
          const maxRetries = 60; // 60 seconds max

          while (retries < maxRetries) {
            await new Promise((r) => setTimeout(r, 2000)); // Wait 2 seconds between checks

            const statusRes = await fetch(
              `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?did=${encodeURIComponent(did)}&jobId=${encodeURIComponent(uploadData.jobId)}`,
              {
                headers: {
                  Authorization: `Bearer ${serviceAuth.token}`,
                },
              },
            );

            if (statusRes.ok) {
              const statusData = (await statusRes.json()) as {
                blob?: unknown;
                error?: string;
                jobStatus?: {
                  state?: string;
                  error?: string;
                  blob?: unknown;
                };
              };

              const jobState = statusData.jobStatus?.state;
              const blob = statusData.blob ?? statusData.jobStatus?.blob;

              console.log(
                `Video processing status: ${jobState} (attempt ${retries + 1}/${maxRetries})`,
              );

              if (jobState === "JOB_STATE_COMPLETED") {
                if (blob) {
                  videoBlob = blob;
                  console.log("✅ Video processed and ready");
                  break;
                }
                console.warn(
                  "Bluesky returned JOB_STATE_COMPLETED but no blob; full response:",
                  JSON.stringify(statusData).slice(0, 500),
                );
                return {
                  status: "failed",
                  lastError:
                    "Bluesky video completed but did not return the video. Try again.",
                  error: "No blob",
                };
              }

              if (statusData.jobStatus?.state === "JOB_STATE_FAILED") {
                return {
                  status: "failed",
                  lastError:
                    "Bluesky video processing failed. Try a different video.",
                  error: "Processing failed",
                };
              }

              const rawError = statusData.jobStatus?.error ?? statusData.error;
              if (rawError) {
                const error = rawError || "Unknown error";
                let userMessage: string;
                if (error === "unconfirmed_email") {
                  userMessage =
                    "Bluesky requires a confirmed email to upload videos. Please verify your email at bsky.app/settings and try again.";
                } else if (error === "invalid_token") {
                  userMessage =
                    "Bluesky authentication expired. Please reconnect your account.";
                } else if (error === "video_too_large") {
                  userMessage =
                    "Video exceeds Bluesky's 100MB limit. Please use a smaller video.";
                } else if (error === "invalid_format") {
                  userMessage =
                    "Bluesky doesn't support this video format. Use MP4 or MOV.";
                } else if (error === "processing_failed") {
                  userMessage =
                    "Bluesky failed to process the video. Try a different video or shorter duration.";
                } else {
                  userMessage = `Bluesky video upload failed: ${error}`;
                }
                return {
                  status: "failed",
                  lastError: userMessage,
                  error,
                };
              }
            }

            retries++;
          }

          if (!videoBlob) {
            return {
              status: "failed",
              lastError:
                "Bluesky video processing timeout (60s). Video may be too long or large. Try a shorter video.",
              error: "Timeout",
            };
          }
        } else {
          return {
            status: "failed",
            lastError: "Video upload did not return a job ID or blob",
            error: "Invalid upload response",
          };
        }
      } catch (error) {
        console.error(`Error processing video ${video.url}:`, error);
        return {
          status: "failed",
          lastError:
            error instanceof Error ? error.message : "Failed to process video",
          error: String(error),
        };
      }
    }

    // Create post record
    const record: {
      text: string;
      createdAt: string;
      embed?:
        | {
            $type: "app.bsky.embed.images";
            images: Array<{ alt: string; image: unknown }>;
          }
        | {
            $type: "app.bsky.embed.video";
            video: unknown;
            alt?: string;
          }
        | undefined;
    } = {
      text: text || "",
      createdAt: new Date().toISOString(),
    };

    // Add video embed if present (takes priority over images) — but only when there are no images.
    if (videoBlob && imageBlobs.length === 0) {
      record.embed = {
        $type: "app.bsky.embed.video",
        video: videoBlob,
        alt: text || "", // Use post text as alt text for video
      };
    } else if (imageBlobs.length > 0) {
      // Add images if present (only if no video)
      record.embed = {
        $type: "app.bsky.embed.images",
        images: imageBlobs,
      };
    }

    // Create post
    const createRes = await fetch(
      "https://bsky.social/xrpc/com.atproto.repo.createRecord",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          repo: did,
          collection: "app.bsky.feed.post",
          record,
        }),
      },
    );

    const createData = (await createRes.json().catch(() => ({}))) as {
      uri?: string;
      error?: string;
      message?: string;
    };

    if (!createRes.ok) {
      const err =
        createData.message ?? createData.error ?? `HTTP ${createRes.status}`;
      console.error("Bluesky createRecord failed:", {
        status: createRes.status,
        error: createData,
        record,
      });
      return { status: "failed", lastError: err, error: err };
    }

    // Build post URL
    const rkey = createData.uri?.split("/").pop();
    const platformPostUrl = rkey
      ? `https://bsky.app/profile/${handle}/post/${rkey}`
      : (createData.uri ?? null);

    return {
      status: "published",
      platformPostId: createData.uri ?? rkey ?? null,
      platformPostUrl,
      publishedAt: new Date(),
    };
  } catch (error) {
    console.error("Bluesky publish error:", error);
    return {
      status: "failed",
      lastError: error instanceof Error ? error.message : "Unknown error",
      error: String(error),
    };
  }
}

/** Max size for YouTube uploads (Shorts and regular, up to 5 min). */
const YOUTUBE_MAX_VIDEO_BYTES = 512 * 1024 * 1024;
/** Duration threshold (seconds) for classifying as Short: ≤3 min vertical → Short, else regular. */
const YOUTUBE_SHORT_MAX_DURATION = 180;

async function publishToYouTube(
  pub: Pub,
  post: Post,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  accessToken: string, // Unused - we get fresh token via getValidToken
): Promise<PublishPlatformResult> {
  // Get fresh token (auto-refreshes if needed)
  let validToken: string;
  try {
    validToken = await getValidToken(pub.connectedAccountId, "youtube");
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to get valid token";
    return { status: "failed", lastError: errorMsg, error: errorMsg };
  }

  console.log("🔍 YouTube publish attempt:", {
    tokenPrefix: validToken.substring(0, 30),
    videoUrl: post,
  });
  const media = post.mediaIds?.length
    ? await getMediaWithUrls(post.mediaIds)
    : [];
  const videoEntry = media.find((m) => m.mimeType.startsWith("video/"));
  if (!videoEntry?.url) {
    const hint =
      post.mediaIds?.length && media.length === 0
        ? "Upload video through this app; external URLs are not allowed."
        : "YouTube requires a video (up to 5 minutes).";
    return { status: "failed", lastError: hint, error: "No video" };
  }

  const videoMeta = (post.metadata as { video?: { durationSeconds?: number; isVertical?: boolean } })?.video;
  const durationSeconds = typeof videoMeta?.durationSeconds === "number" ? videoMeta.durationSeconds : 0;
  const isVertical = videoMeta?.isVertical === true;
  const isShort = durationSeconds <= YOUTUBE_SHORT_MAX_DURATION && isVertical;

  let videoBuffer: Buffer;
  try {
    const res = await fetch(videoEntry.url, { method: "GET" });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > YOUTUBE_MAX_VIDEO_BYTES) {
        return {
          status: "failed",
          lastError: `Video is too large for YouTube (max ${YOUTUBE_MAX_VIDEO_BYTES / 1024 / 1024}MB).`,
          error: "Video too large",
        };
      }
    }
    videoBuffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to fetch video";
    return { status: "failed", lastError: err, error: err };
  }

  if (videoBuffer.length > YOUTUBE_MAX_VIDEO_BYTES) {
    return {
      status: "failed",
      lastError: `Video is too large for YouTube (max ${YOUTUBE_MAX_VIDEO_BYTES / 1024 / 1024}MB).`,
      error: "Video too large",
    };
  }

  const meta = post.metadata as { youtube?: { title?: string }; video?: { durationSeconds?: number; isVertical?: boolean } } | undefined;
  const userTitle = meta?.youtube?.title?.trim();
  const fallbackTitle = truncate(post.finalContent?.trim() ?? "Short", 95);
  const title = isShort
    ? (userTitle ? truncate(`${userTitle} #Shorts`, 100) : truncate(`${fallbackTitle} #Shorts`, 100))
    : (userTitle ? truncate(userTitle, 100) : truncate(fallbackTitle, 100));
  const description = truncate(post.finalContent?.trim() ?? "", 5000);
  const snippet = {
    title,
    description: isShort
      ? (description.includes("#Shorts") ? description : `${description}\n\n#Shorts`)
      : description,
  };
  const metadata = {
    snippet,
    status: { privacyStatus: "public" as const },
  };

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${validToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "x-upload-content-type": videoEntry.mimeType || "video/mp4",
        "X-Upload-Content-Length": String(videoBuffer.length),
      },
      body: JSON.stringify(metadata),
    },
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    let errMsg = `YouTube API: ${initRes.status}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) errMsg = errJson.error.message;
    } catch {
      // ignore
    }
    return { status: "failed", lastError: errMsg, error: errMsg };
  }

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) {
    return {
      status: "failed",
      lastError: "YouTube did not return upload URL",
      error: "No upload URL",
    };
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(videoBuffer.length),
      "Content-Type": videoEntry.mimeType || "video/mp4",
      "Content-Range": `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
    },
    body: new Uint8Array(videoBuffer),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    let errMsg = `YouTube upload: ${uploadRes.status}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) errMsg = errJson.error.message;
    } catch {
      // ignore
    }
    return { status: "failed", lastError: errMsg, error: errMsg };
  }

  const uploadData = (await uploadRes.json().catch(() => ({}))) as {
    id?: string;
  };
  const videoId = uploadData.id;
  const platformPostUrl = videoId
    ? isShort
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`
    : null;

  return {
    status: "published",
    platformPostId: videoId ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";

/**
 * Register a video upload with Pinterest and upload the file to the returned S3 URL.
 * Returns media_id for use in pin creation with source_type: "video_id".
 */
async function uploadPinterestVideo(
  videoUrl: string,
  videoMimeType: string,
  accessToken: string,
): Promise<string> {
  const registerRes = await fetch(`${PINTEREST_API_BASE}/media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ media_type: "video" }),
  });
  const registerData = (await registerRes.json().catch(() => ({}))) as {
    media_id?: string;
    upload_url?: string;
    upload_parameters?: Record<string, string>;
    message?: string;
  };
  if (!registerRes.ok || !registerData.media_id || !registerData.upload_url) {
    const err =
      registerData.message ??
      `Pinterest media register failed: HTTP ${registerRes.status}`;
    throw new Error(err);
  }

  const videoBuffer = await fetchMediaBytes(videoUrl);
  const form = new FormData();
  const params = registerData.upload_parameters ?? {};
  for (const [key, value] of Object.entries(params)) {
    form.append(key, value);
  }
  form.append(
    "file",
    new Blob([videoBuffer], { type: videoMimeType || "video/mp4" }),
    "video.mp4",
  );

  const uploadRes = await fetch(registerData.upload_url, {
    method: "POST",
    body: form,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(
      `Pinterest video upload failed: HTTP ${uploadRes.status}${text ? ` - ${text.slice(0, 200)}` : ""}`,
    );
  }

  // Poll until Pinterest finishes processing the video
  const mediaId = registerData.media_id;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(`${PINTEREST_API_BASE}/media/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const statusData = (await statusRes.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
    };
    console.log(
      `[Pinterest] video status (attempt ${i + 1}):`,
      statusData.status,
    );
    if (statusData.status === "succeeded") break;
    if (statusData.status === "failed") {
      throw new Error(
        `Pinterest video processing failed: ${statusData.message ?? "unknown"}`,
      );
    }
  }

  return mediaId;
}

async function publishToPinterest(
  pub: Pub,
  post: Post,
  accessToken: string,
): Promise<PublishPlatformResult> {
  const boardId =
    pub.platformMetadata && typeof pub.platformMetadata.boardId === "string"
      ? pub.platformMetadata.boardId
      : null;
  if (!boardId) {
    return {
      status: "failed",
      lastError:
        "Pinterest board not selected. Please select a board in the post composer when publishing to Pinterest.",
      error: "No board",
    };
  }

  const media = post.mediaIds?.length
    ? await getMediaWithUrlsAndThumbnail(post.mediaIds)
    : [];
  const imageEntry = media.find((m) => m.mimeType.startsWith("image/"));
  const videoEntry = media.find((m) => m.mimeType.startsWith("video/"));
  const imageUrl = imageEntry?.url;
  const videoUrl = videoEntry?.url;
  const videoCoverUrl =
    videoEntry?.thumbnailUrl && videoEntry.thumbnailUrl.trim() !== ""
      ? videoEntry.thumbnailUrl.trim()
      : null;

  if (!imageUrl && !videoUrl) {
    const hint =
      post.mediaIds?.length && media.length === 0
        ? "Upload images or video through this app; external URLs are not allowed."
        : "Pinterest pins require at least one image or video.";
    return { status: "failed", lastError: hint, error: "No media" };
  }

  const rawDesc = post.finalContent?.trim() ?? "";
  const metaTitle =
    pub.platformMetadata && typeof pub.platformMetadata.title === "string"
      ? pub.platformMetadata.title.trim()
      : null;
  const title =
    (metaTitle && metaTitle.length > 0
      ? truncate(metaTitle, 100)
      : truncate(rawDesc, 100)) || "Pin";
  const description = truncate(rawDesc, 500);
  const link =
    pub.platformMetadata && typeof pub.platformMetadata.link === "string"
      ? pub.platformMetadata.link.trim()
      : null;

  let media_source: {
    source_type: "image_url" | "video_id";
    url?: string;
    content_type?: string;
    media_id?: string;
    cover_image_url?: string;
    cover_image_content_type?: string;
    cover_image_key_frame_time?: number;
  };
  if (videoUrl && videoEntry) {
    try {
      const mediaId = await uploadPinterestVideo(
        videoUrl,
        videoEntry.mimeType ?? "video/mp4",
        accessToken,
      );
      media_source = {
        source_type: "video_id",
        media_id: mediaId,
        ...(videoCoverUrl
          ? {
              cover_image_url: videoCoverUrl,
              cover_image_content_type: "image/jpeg",
            }
          : { cover_image_key_frame_time: 1 }),
      };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return {
        status: "failed",
        lastError: `Pinterest video upload failed: ${err}`,
        error: err,
      };
    }
  } else {
    media_source = {
      source_type: "image_url",
      url: imageUrl!,
      content_type: imageEntry?.mimeType ?? "image/jpeg",
    };
  }

  const pinPayload: Record<string, unknown> = {
    board_id: boardId,
    title,
    description: description || undefined,
    media_source,
  };
  if (link && link.length > 0) {
    pinPayload.destination_link = link;
  }
  console.log("[Pinterest] pinPayload:", JSON.stringify(pinPayload, null, 2));
  const res = await fetch(`${PINTEREST_API_BASE}/pins`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(pinPayload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    link?: string;
    message?: string;
  };
  if (!res.ok) {
    const raw = data.message ?? `HTTP ${res.status}`;
    const err =
      raw.toLowerCase().includes("not permitted") ||
      raw.toLowerCase().includes("access that resource")
        ? "Pinterest’s API doesn’t allow posting to private boards. Use a public board to publish pins from this app."
        : raw;
    return { status: "failed", lastError: err, error: err };
  }
  const pinId = data.id ?? null;
  const platformPostUrl =
    typeof data.link === "string" && data.link.trim().length > 0
      ? data.link.trim()
      : pinId
        ? `https://www.pinterest.com/pin/${pinId}/`
        : null;
  return {
    status: "published",
    platformPostId: pinId,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

async function publishToInstagram(
  pub: Pub,
  post: Post,
  accessToken: string,
  instagramOptions?: { coverImageUrl?: string; isTrialReel: boolean },
): Promise<PublishPlatformResult> {
  const igUserId = pub.platformUserId;
  console.log("🔍 Instagram publish attempt:", {
    igUserId,
    tokenPrefix: accessToken.substring(0, 30),
  });
  const caption = truncate(post.finalContent?.trim() ?? "", 2200);
  // Collection/carousel: up to 10 items in order, mixed images and videos
  const orderedMedia = post.mediaIds?.length
    ? (await getOrderedMediaWithUrls(post.mediaIds)).slice(0, 10)
    : [];
  const images = orderedMedia.filter((m) => m.mimeType.startsWith("image/"));
  const videos = orderedMedia.filter((m) => m.mimeType.startsWith("video/"));
  const imageUrl = images[0]?.url;
  const videoUrl = videos[0]?.url;
  const isCarousel = orderedMedia.length > 1;

  if (orderedMedia.length === 0) {
    const hint = post.mediaIds?.length
      ? "Upload media through this app; external URLs are not allowed."
      : "Instagram requires at least one image or video.";
    return { status: "failed", lastError: hint, error: "No media" };
  }

  let containerData: {
    id?: string;
    error?: { message?: string; type?: string; code?: number };
  };

  // Handle carousel (multiple items: images and/or videos, up to 10)
  if (orderedMedia.length > 1) {
    console.log(
      `📸 Creating Instagram carousel with ${orderedMedia.length} items (images + videos)...`,
    );

    const createdItems: { id: string; isVideo: boolean }[] = [];

    for (let i = 0; i < orderedMedia.length; i++) {
      const item = orderedMedia[i];
      const isVideo = item.mimeType.startsWith("video/");
      console.log(
        "Instagram carousel item",
        i,
        "mimeType:",
        item.mimeType,
        "isVideo:",
        isVideo,
      );
      const body: Record<string, string | boolean> = {
        is_carousel_item: true,
        media_type: isVideo ? "VIDEO" : "IMAGE",
        ...(isVideo ? { video_url: item.url } : { image_url: item.url }),
      };

      const itemRes = await fetch(
        `https://graph.instagram.com/v21.0/${igUserId}/media`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        },
      );

      const itemData = (await itemRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };

      if (itemRes.ok && itemData.id) {
        createdItems.push({ id: itemData.id, isVideo });
        console.log(
          `✅ Carousel item ${createdItems.length} created: ${itemData.id}`,
        );
      } else {
        console.error(`❌ Failed to create carousel item:`, itemData.error);
      }
    }

    if (createdItems.length === 0) {
      return {
        status: "failed",
        lastError: "Failed to upload carousel items",
        error: "Upload failed",
      };
    }

    // Second pass: wait for ALL video items to finish processing before creating container
    const videoItemIds = createdItems.filter((x) => x.isVideo).map((x) => x.id);
    if (videoItemIds.length > 0) {
      console.log(
        `⏳ Polling ${videoItemIds.length} Instagram video item(s) until FINISHED before container...`,
      );
      const maxAttempts = 60;
      const delayMs = 3000;

      for (const itemId of videoItemIds) {
        let attempts = 0;
        while (attempts < maxAttempts) {
          const statusRes = await fetch(
            `https://graph.instagram.com/v21.0/${itemId}?fields=status_code`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (statusRes.ok) {
            const statusData = (await statusRes.json()) as {
              status_code?: string;
              error?: { message?: string };
            };
            const statusCode = statusData.status_code;
            console.log(
              `Instagram video item ${itemId} status: ${statusCode ?? "unknown"} (attempt ${attempts + 1}/${maxAttempts})`,
            );
            if (statusCode === "FINISHED") break;
            if (statusCode === "ERROR") {
              const errMsg =
                statusData.error?.message ?? "Video item processing failed";
              return {
                status: "failed",
                lastError: errMsg,
                error: "Instagram video processing error",
              };
            }
          }
          await sleep(delayMs);
          attempts++;
        }
        if (attempts >= maxAttempts) {
          const err = `Instagram video item ${itemId} did not finish processing within ${maxAttempts * (delayMs / 1000)}s.`;
          console.error("❌", err);
          return { status: "failed", lastError: err, error: "Timeout" };
        }
      }
      console.log("✅ All Instagram video carousel items finished processing.");
    }

    // Wait for items to settle before creating container
    await sleep(8000);

    const containerIds = createdItems.map((x) => x.id);

    // Create carousel container
    const carouselRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: containerIds.join(","),
          caption: caption || undefined,
        }),
      },
    );

    const carouselData = (await carouselRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };

    if (!carouselRes.ok || !carouselData.id) {
      const err = carouselData.error?.message ?? `HTTP ${carouselRes.status}`;
      console.error("Instagram carousel creation failed:", {
        status: carouselRes.status,
        error: carouselData.error,
      });
      return { status: "failed", lastError: err, error: err };
    }

    console.log("✅ Instagram carousel container created:", {
      containerId: carouselData.id,
      itemCount: containerIds.length,
    });

    containerData = carouselData;
  } else if (orderedMedia.length === 1 && imageUrl) {
    // Single image
    const containerBody: {
      caption?: string;
      image_url?: string;
    } = {
      image_url: imageUrl,
      caption: caption || undefined,
    };

    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(containerBody),
      },
    );

    containerData = (await containerRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string; type?: string; code?: number };
    };

    if (!containerRes.ok || !containerData.id) {
      const err = containerData.error?.message ?? `HTTP ${containerRes.status}`;
      console.error("Instagram container creation failed:", {
        status: containerRes.status,
        error: containerData.error,
        body: containerBody,
        response: containerData,
      });
      return { status: "failed", lastError: err, error: err };
    }

    console.log("✅ Instagram container created:", {
      containerId: containerData.id,
      mediaType: "image",
    });
  } else if (orderedMedia.length === 1 && videoUrl) {
    // Single video (Reels)
    const containerBody: {
      caption?: string;
      video_url?: string;
      media_type?: string;
      cover_url?: string;
      share_to_feed?: boolean;
    } = {
      video_url: videoUrl,
      media_type: "REELS", // Videos must be posted as Reels
      caption: caption || undefined,
    };
    if (instagramOptions?.coverImageUrl) {
      containerBody.cover_url = instagramOptions.coverImageUrl;
    }
    if (instagramOptions?.isTrialReel === true) {
      containerBody.share_to_feed = false; // Trial reel: test with non-followers first
    }

    console.log("[Instagram Reels] Container creation request body:", {
      ...containerBody,
      cover_url: containerBody.cover_url
        ? `${containerBody.cover_url.slice(0, 60)}...`
        : undefined,
    });

    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(containerBody),
      },
    );

    const rawContainerJson = await containerRes.json().catch(() => ({}));
    containerData = rawContainerJson as {
      id?: string;
      error?: { message?: string; type?: string; code?: number };
    };

    if (!containerRes.ok || !containerData.id) {
      const err = containerData.error?.message ?? `HTTP ${containerRes.status}`;
      console.error("Instagram container creation failed:", {
        status: containerRes.status,
        error: containerData.error,
        body: containerBody,
        response: containerData,
      });
      return { status: "failed", lastError: err, error: err };
    }

    if (containerData.error) {
      console.warn("[Instagram Reels] Container response included error/warning:", containerData.error);
    }
    console.log("✅ Instagram container created:", {
      containerId: containerData.id,
      mediaType: "video",
      hadCoverUrl: !!containerBody.cover_url,
      responseKeys: Object.keys(rawContainerJson),
    });
  } else {
    return {
      status: "failed",
      lastError: "Instagram requires at least one image or video",
      error: "No media",
    };
  }

  // Step 2: Wait for media processing
  // For single videos: poll container until FINISHED.
  // For carousels: poll the carousel container itself until FINISHED.
  if (videoUrl && images.length === 0) {
    // Poll container status for videos
    let retries = 0;
    const maxRetries = 60; // 60 seconds max

    console.log("⏳ Starting video processing status polling...");

    while (retries < maxRetries) {
      const statusRes = await fetch(
        `https://graph.instagram.com/v21.0/${containerData.id}?fields=status_code`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as {
          status_code?: string;
          error?: { message?: string };
        };

        const statusCode = statusData.status_code;

        console.log(
          `Instagram video processing status: ${statusCode ?? "unknown"} (attempt ${retries + 1}/${maxRetries})`,
        );

        if (statusCode === "FINISHED") {
          console.log("✅ Video processing completed, ready to publish");
          break; // Ready to publish
        }

        if (statusCode === "ERROR") {
          const errorMsg =
            statusData.error?.message ?? "Video processing failed on Instagram";
          console.error("❌ Instagram video processing error:", errorMsg);
          return {
            status: "failed",
            lastError: errorMsg,
            error: "Processing error",
          };
        }

        // Handle other status codes (IN_PROGRESS, etc.)
        if (
          statusCode &&
          !["IN_PROGRESS", "FINISHED", "ERROR"].includes(statusCode)
        ) {
          console.warn(`⚠️ Unknown status code: ${statusCode}`);
        }
      } else {
        // Handle status check API errors
        const errorText = await statusRes.text().catch(() => "Unknown error");
        const isPermanentError =
          statusRes.status === 404 || statusRes.status === 401;

        if (isPermanentError) {
          console.error(
            `❌ Status check failed with permanent error (attempt ${retries + 1}): HTTP ${statusRes.status}`,
            errorText,
          );
          return {
            status: "failed",
            lastError: `Instagram API error: ${errorText || `HTTP ${statusRes.status}`}`,
            error: "Status check failed",
          };
        }

        // Log transient errors but continue polling
        console.warn(
          `⚠️ Status check failed (attempt ${retries + 1}): HTTP ${statusRes.status}`,
          errorText,
        );
      }

      await new Promise((r) => setTimeout(r, 2000)); // Wait 2 seconds between checks
      retries++;
    }

    if (retries >= maxRetries) {
      console.error(
        `❌ Video processing timeout after ${maxRetries} attempts (${maxRetries * 2}s)`,
      );
      return {
        status: "failed",
        lastError: "Video processing timeout (120s). Try a shorter video.",
        error: "Timeout",
      };
    }
  } else if (isCarousel && containerData.id) {
    // Poll carousel container status before publishing
    const maxAttempts = 30;
    const delayMs = 3000;
    let attempts = 0;

    console.log(
      `⏳ Polling Instagram carousel container ${containerData.id} until FINISHED...`,
    );

    while (attempts < maxAttempts) {
      const statusRes = await fetch(
        `https://graph.instagram.com/v21.0/${containerData.id}?fields=status_code`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (statusRes.ok) {
        const statusData = (await statusRes.json().catch(() => ({}))) as {
          status_code?: string;
          error?: { message?: string };
        };
        const statusCode = statusData.status_code;

        console.log(
          `Instagram carousel container status: ${statusCode ?? "unknown"} (attempt ${
            attempts + 1
          }/${maxAttempts})`,
        );

        if (statusCode === "FINISHED") {
          console.log("✅ Instagram carousel container finished processing");
          break;
        }

        if (statusCode === "ERROR") {
          const errorMsg =
            statusData.error?.message ??
            "Instagram carousel container processing failed";
          console.error("❌ Instagram carousel container error:", errorMsg);
          return {
            status: "failed",
            lastError: errorMsg,
            error: "Processing error",
          };
        }
      } else {
        const errorText = await statusRes.text().catch(() => "Unknown error");
        console.warn(
          `⚠️ Instagram carousel status check failed (attempt ${
            attempts + 1
          }/${maxAttempts}): HTTP ${statusRes.status}`,
          errorText,
        );
      }

      attempts += 1;
      await sleep(delayMs);
    }

    if (attempts >= maxAttempts) {
      const err =
        "Instagram carousel container did not finish processing in time";
      console.error("❌", err);
      return { status: "failed", lastError: err, error: err };
    }
  } else {
    // Images-only, non-carousel posts process quickly
    console.log("⏳ Waiting 3s for image processing...");
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Step 3: Publish the container
  console.log("📤 Publishing Instagram container...");
  const publishRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ creation_id: containerData.id }),
    },
  );

  const publishData = (await publishRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!publishRes.ok) {
    const err = publishData.error?.message ?? `HTTP ${publishRes.status}`;
    console.error("❌ Instagram publish failed:", {
      status: publishRes.status,
      error: publishData.error,
      response: publishData,
    });
    return { status: "failed", lastError: err, error: err };
  }

  const platformPostUrl =
    resolveInstagramProfileUrl({
      platformUsername: pub.platformUsername,
      platformUserId: pub.platformUserId,
    }) ?? null;

  console.log("✅ Instagram post published successfully:", {
    postId: publishData.id,
    url: platformPostUrl,
  });

  return {
    status: "published",
    platformPostId: publishData.id ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

type TikTokPlatformOptions = {
  autoAddMusic?: boolean;
};

const TIKTOK_FETCH_TIMEOUT_MS = 15_000;
const TIKTOK_POLL_INTERVAL_MS = 4_000;
/** Keep total TikTok wait under typical server-action limits (Vercel ~60s incl. init). */
const TIKTOK_MAX_POLLS = 10;

const TIKTOK_ACCEPTED_STATUSES = new Set([
  "PUBLISH_COMPLETE",
  "SEND_TO_USER_INBOX",
]);

async function tiktokApiFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  return fetchWithTimeout(url, {
    ...init,
    timeoutMs: TIKTOK_FETCH_TIMEOUT_MS,
  });
}

async function buildTikTokPublishedResult(
  pub: Pub,
  accessToken: string,
  platformPostId?: string | null,
): Promise<PublishPlatformResult> {
  let platformPostUrl: string | null = null;
  try {
    platformPostUrl = await resolveTikTokPublishedProfileUrl(pub, accessToken);
  } catch {
    platformPostUrl = resolveTikTokProfileUrl({
      platformUsername: pub.platformUsername,
      platformMetadata: pub.platformMetadata,
    });
  }
  return {
    status: "published",
    platformPostId: platformPostId ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

async function resolveTikTokPublishedProfileUrl(
  pub: Pub,
  _accessToken: string,
): Promise<string | null> {
  return resolveTikTokProfileUrl({
    platformUsername: pub.platformUsername,
    platformMetadata: pub.platformMetadata,
  });
}

async function publishToTikTok(
  pub: Pub,
  post: Post,
  accessToken: string,
  tiktokOptions?: TikTokPlatformOptions,
): Promise<PublishPlatformResult> {
  const media = post.mediaIds?.length
    ? await getMediaWithUrls(post.mediaIds)
    : [];
  const videoEntry = media.find((m) => m.mimeType.startsWith("video/"));
  const imageEntries = media.filter((m) => m.mimeType.startsWith("image/"));

  const isPhotoPost = imageEntries.length > 0 && !videoEntry;
  const isVideoPost = !!videoEntry?.url;

  if (!isVideoPost && !isPhotoPost) {
    const hint =
      post.mediaIds?.length && media.length === 0
        ? "Upload media through this app; external URLs are not allowed."
        : "TikTok requires a video or image. Upload media and try again.";
    return { status: "failed", lastError: hint, error: "No media" };
  }

  // Photo post: TikTok supports JPG/JPEG/WEBP only. PNG is converted to JPEG during processing (processImageForTikTok).
  if (isPhotoPost) {
    if (imageEntries.length > 35) {
      return {
        status: "failed",
        lastError: "TikTok allows at most 35 images per post.",
        error: "Too many images",
      };
    }
  }

  // Get TikTok settings from post metadata
  const tiktokMetadata = post.metadata?.tiktok as
    | Record<
        string,
        {
          privacy_level: string;
          disable_comment: boolean;
          disable_duet: boolean;
          disable_stitch: boolean;
          brand_content_toggle: boolean;
          brand_organic?: boolean;
          brand_content?: boolean;
          brand_organic_toggle?: boolean;
        }
      >
    | undefined;

  const accountSettings = tiktokMetadata?.[pub.connectedAccountId];

  if (!accountSettings || !accountSettings.privacy_level) {
    return {
      status: "failed",
      lastError:
        "TikTok privacy level is required. Please set TikTok post settings before publishing.",
      error: "Missing TikTok settings",
    };
  }

  if (
    accountSettings.brand_content &&
    accountSettings.privacy_level === "SELF_ONLY"
  ) {
    return {
      status: "failed",
      lastError:
        "TikTok: Branded content visibility cannot be set to private. Please select Public or Friends.",
      error: "Invalid privacy for branded content",
    };
  }

  const caption = post.finalContent?.trim() ?? "";
  const captionTruncated = truncate(caption, 2200);

  const postAsDraft = !!(accountSettings as any).post_as_draft;
  const markAiGenerated = !!(accountSettings as any).mark_ai_generated;

  // Base post_info shared by video and photo (only used when not posting as draft)
  const basePostInfo: {
    privacy_level: string;
    title?: string;
    description?: string;
    disable_comment?: boolean;
    disable_duet?: boolean;
    disable_stitch?: boolean;
    brand_content_toggle?: boolean;
    brand_organic_toggle?: boolean;
    is_aigc?: boolean;
  } = {
    privacy_level: accountSettings.privacy_level,
  };

  const userTitle = (accountSettings as any).video_title?.trim();
  if (userTitle) {
    basePostInfo.title = userTitle.slice(0, 150);
    if (captionTruncated) {
      basePostInfo.description = captionTruncated;
    }
  } else if (captionTruncated) {
    basePostInfo.title = captionTruncated;
  }

  if (accountSettings.disable_comment) {
    basePostInfo.disable_comment = true;
  }
  if (!isPhotoPost) {
    if (accountSettings.disable_duet) basePostInfo.disable_duet = true;
    if (accountSettings.disable_stitch) basePostInfo.disable_stitch = true;
  }

  if (accountSettings.brand_content_toggle) {
    const hasOrganic =
      accountSettings.brand_organic ??
      accountSettings.brand_organic_toggle === true;
    const hasBranded =
      accountSettings.brand_content ??
      (accountSettings.brand_organic_toggle === false &&
        accountSettings.brand_content_toggle);
    // TikTok treats these as independent flags:
    // brand_content_toggle = paid partnership (third party), brand_organic_toggle = own brand
    if (hasBranded) basePostInfo.brand_content_toggle = true;
    if (hasOrganic) basePostInfo.brand_organic_toggle = true;
  }

  if (markAiGenerated) {
    basePostInfo.is_aigc = true;
  }

  let initRes: Response;
  if (isPhotoPost) {
    // Photo Post API: content/init with media_type PHOTO, post_mode MEDIA_UPLOAD (try MEDIA_UPLOAD for unaudited apps)
    const hasAnyUrl = imageEntries.some((m) => m.url);
    if (!hasAnyUrl) {
      return {
        status: "failed",
        lastError: "No valid image URLs.",
        error: "No images",
      };
    }

    // Validate and process each image for TikTok (dimensions, size, aspect ratio); re-upload with -tiktok suffix
    const photoUrls: string[] = [];
    for (let i = 0; i < imageEntries.length; i++) {
      const entry = imageEntries[i];
      if (!entry.url) continue;
      try {
        const processedUrl = await processImageForTikTok(
          entry.url,
          entry.mimeType,
        );
        photoUrls.push(processedUrl);
      } catch (err) {
        const msg =
          err instanceof TikTokImageError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to process image for TikTok";
        return { status: "failed", lastError: msg, error: msg };
      }
    }

    if (photoUrls.length === 0) {
      return {
        status: "failed",
        lastError: "No valid image URLs after processing.",
        error: "No images",
      };
    }

    // Build photo-specific post_info (no duet/stitch, different brand content structure)
    // TikTok API requires brand_content_toggle and brand_organic_toggle as booleans for DIRECT_POST
    const photoPostInfo: {
      privacy_level: string;
      title?: string;
      description?: string;
      disable_comment?: boolean;
      brand_content_toggle: boolean;
      brand_organic_toggle: boolean;
      is_aigc?: boolean;
      auto_add_music?: boolean;
    } = {
      privacy_level: accountSettings.privacy_level,
      brand_content_toggle: false,
      brand_organic_toggle: false,
    };

    if (!postAsDraft) {
      photoPostInfo.auto_add_music =
        tiktokOptions?.autoAddMusic ?? true;
    }

    const userPhotoTitle = (accountSettings as any).video_title?.trim();
    if (userPhotoTitle) {
      photoPostInfo.title = userPhotoTitle.slice(0, 90);
      if (caption) photoPostInfo.description = truncate(caption, 4000);
    } else if (caption) {
      photoPostInfo.title = truncate(caption, 90);
      photoPostInfo.description = truncate(caption, 4000);
    }

    if (accountSettings.disable_comment) {
      photoPostInfo.disable_comment = true;
    }

    // Photo posts: brand_content_toggle and brand_organic_toggle are required booleans
    // brand_content_toggle: true if promoting third-party business (Branded content radio)
    // brand_organic_toggle: true if promoting creator's own business (Your brand radio)
    if (accountSettings.brand_content_toggle) {
      const hasOrganic =
        accountSettings.brand_organic ??
        accountSettings.brand_organic_toggle === true;
      const hasBranded =
        accountSettings.brand_content ??
        (accountSettings.brand_organic_toggle === false &&
          accountSettings.brand_content_toggle);

      // Independent flags: both can be true (labeled "Paid partnership")
      photoPostInfo.brand_content_toggle = hasBranded;
      photoPostInfo.brand_organic_toggle = hasOrganic;
    }

    if (markAiGenerated) {
      photoPostInfo.is_aigc = true;
    }

    const requestBody = {
      media_type: "PHOTO",
      post_mode: postAsDraft ? "MEDIA_UPLOAD" : "DIRECT_POST",
      post_info: photoPostInfo,
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: photoUrls,
      },
    };

    console.log(
      "TikTok photo post request:",
      JSON.stringify(requestBody, null, 2),
    );

    initRes = await tiktokApiFetch(
      "https://open.tiktokapis.com/v2/post/publish/content/init/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      },
    );
  } else {
    // Video: use inbox/init when post_as_draft (saves to TikTok drafts), else direct publish
    const videoInitUrl = postAsDraft
      ? "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/"
      : "https://open.tiktokapis.com/v2/post/publish/video/init/";

    const videoBody = postAsDraft
      ? {
          source_info: {
            source: "PULL_FROM_URL",
            video_url: videoEntry!.url,
          },
        }
      : {
          post_info: basePostInfo,
          source_info: {
            source: "PULL_FROM_URL",
            video_url: videoEntry!.url,
          },
        };

    initRes = await tiktokApiFetch(videoInitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(videoBody),
    });
  }

  const initData = (await initRes.json().catch((e) => {
    console.error("TikTok publish/init: failed to parse JSON", e);
    return {};
  })) as {
    data?: { publish_id?: string };
    error?: { code?: string; message?: string; log_id?: string };
  };

  const mediaLabel = isPhotoPost ? "Image" : "Video";
  if (!initRes.ok || (initData.error?.code && initData.error.code !== "ok")) {
    console.error(
      `TikTok publish/init (${isPhotoPost ? "photo" : "video"}) API response:`,
      {
        httpStatus: initRes.status,
        body: initData,
        errorCode: initData.error?.code,
        errorMessage: initData.error?.message,
      },
    );
  }

  if (!initRes.ok) {
    const err = initData.error?.message ?? `HTTP ${initRes.status}`;
    if (initData.error?.code === "url_ownership_unverified") {
      return {
        status: "failed",
        lastError: `${mediaLabel} URL domain is not verified in your TikTok app. Verify the domain in TikTok for Developers.`,
        error: err,
      };
    }
    return { status: "failed", lastError: err, error: err };
  }

  const publishId = initData.data?.publish_id;
  if (!publishId) {
    console.error("TikTok publish/init: no publish_id in response", {
      httpStatus: initRes.status,
      body: initData,
    });
    return {
      status: "failed",
      lastError: "TikTok did not return a publish ID",
      error: "No publish_id",
    };
  }

  const failReasonMessages: Record<string, string> = {
    picture_size_check_failed:
      "Video resolution doesn't meet TikTok's requirements. Use a vertical 9:16 video at 720×1280 or higher.",
    video_size_check_failed:
      "Video file size exceeds TikTok's limit. Please use a smaller video.",
    video_duration_check_failed:
      "Video duration doesn't meet TikTok's requirements (3 seconds minimum, 10 minutes maximum).",
    video_format_check_failed:
      "Video format not supported by TikTok. Please use MP4 or MOV.",
    url_ownership_unverified:
      "Video URL domain is not verified in your TikTok app.",
    spam: "TikTok flagged this post as spam. Try again later.",
  };

  function tiktokFailReasonMessage(failReason?: string): string {
    if (failReason && failReasonMessages[failReason]) {
      return failReasonMessages[failReason];
    }
    if (failReason) {
      return `TikTok rejected the post: ${failReason.replace(/_/g, " ")}`;
    }
    return `TikTok failed to process the ${isPhotoPost ? "photo" : "video"}.`;
  }

  async function fetchTikTokPublishStatus(publishId: string) {
    const statusRes = await tiktokApiFetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ publish_id: publishId }),
      },
    );
    const statusData = (await statusRes.json().catch((e) => {
      console.error("TikTok publish/status: failed to parse JSON", e);
      return {};
    })) as {
      data?: {
        status?: string;
        fail_reason?: string;
        publicaly_available_post_id?: (string | number)[];
      };
      error?: { code?: string; message?: string };
    };
    return { statusRes, statusData };
  }

  // Poll status; TikTok moderation can take a minute — cap wait so server actions finish.
  for (let i = 0; i < TIKTOK_MAX_POLLS; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, TIKTOK_POLL_INTERVAL_MS));
    }
    let statusRes: Response;
    let statusData: Awaited<ReturnType<typeof fetchTikTokPublishStatus>>["statusData"];
    try {
      ({ statusRes, statusData } = await fetchTikTokPublishStatus(publishId));
    } catch (err) {
      console.error("TikTok publish/status: request failed", err);
      continue;
    }
    const status = statusData.data?.status;

    if (
      status === "FAILED" ||
      (statusData.error && statusData.error.code !== "ok")
    ) {
      console.error("TikTok publish/status API response (failure):", {
        httpStatus: statusRes.status,
        body: statusData,
        errorCode: statusData.error?.code,
        errorMessage: statusData.error?.message,
      });
    }

    if (status === "FAILED") {
      const failReason = statusData.data?.fail_reason as string | undefined;
      const lastError = tiktokFailReasonMessage(failReason);
      return { status: "failed", lastError, error: "Publish failed" };
    }

    if (status && TIKTOK_ACCEPTED_STATUSES.has(status)) {
      const postIds = statusData.data?.publicaly_available_post_id;
      const firstId =
        Array.isArray(postIds) && postIds.length > 0 ? postIds[0] : undefined;
      const videoId = firstId !== undefined ? String(firstId) : undefined;
      return buildTikTokPublishedResult(pub, accessToken, videoId);
    }
  }

  // TikTok accepted the upload but is still processing — don't block the UI/server action.
  console.warn(
    "[TikTok] Publish status still processing after poll cap; marking published",
    { publishId },
  );
  return buildTikTokPublishedResult(pub, accessToken, null);
}

/**
 * Publish a Threads (Meta) reply-chain thread.
 * Strict sequential flow: create first post → publish → get id →
 * for each next part: create container with reply_to_id = previous published id →
 * publish → get id → wait for publish to complete → repeat.
 * Do NOT create all containers upfront; each step waits for the previous publish.
 */
async function publishThreadsThread(
  pub: Pub,
  parts: ThreadPart[],
  accessToken: string,
): Promise<PublishPlatformResult> {
  const threadsUserId = pub.platformUserId;
  const threadParams = new URLSearchParams({ access_token: accessToken });
  let previousPublishedId: string | null = null;
  let firstPublishedId: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    // Wait for previous publish to be visible before creating the next reply
    // (reply_to_id must be the published post ID from threads_publish, not the container ID)
    if (previousPublishedId && i > 0) {
      await new Promise((r) => setTimeout(r, 15000));
    }

    const part = parts[i];
    const safeText = truncate(part.text, 500);
    const media =
      part.mediaIds.length > 0 ? await getMediaWithUrls(part.mediaIds) : [];
    const images = media.filter((m) => m.mimeType.startsWith("image/"));
    const videos = media.filter((m) => m.mimeType.startsWith("video/"));
    const imageUrl = images[0]?.url;
    const videoUrl = videos[0]?.url;

    // reply_to_id is set only after media fields are chosen, immediately before POST /me/threads
    // (must be the published media id from the previous part's threads_publish, never the container id).
    const body: Record<string, string | boolean> = {};

    if (images.length > 1) {
      // Carousel: create item containers for this part only (not replies; they're children)
      const containerIds: string[] = [];
      for (const img of images.slice(0, 20)) {
        const res = await fetch(
          `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: threadsFormBody({
              media_type: "IMAGE",
              image_url: img.url,
              is_carousel_item: true,
            }),
          },
        );
        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
          error?: { message?: string };
        };
        if (!res.ok || !data.id) {
          return {
            status: "failed",
            lastError:
              data.error?.message ?? `Threads thread part ${i + 1} failed`,
            error: "Upload failed",
          };
        }
        containerIds.push(data.id);
      }
      await new Promise((r) => setTimeout(r, 2000));
      body.media_type = "CAROUSEL";
      body.children = containerIds.join(",");
      body.text = safeText;
    } else if (videoUrl) {
      body.media_type = "VIDEO";
      body.video_url = videoUrl;
      body.text = safeText;
    } else if (imageUrl) {
      body.media_type = "IMAGE";
      body.image_url = imageUrl;
      body.text = safeText;
    } else {
      body.media_type = "TEXT";
      body.text = safeText;
    }

    if (i > 0) {
      if (!previousPublishedId) {
        const err = `Threads thread chain broken: missing previous published post id before part ${i + 1}`;
        return {
          status: "failed",
          lastError: err,
          error: "Chain broken",
        };
      }
      body.reply_to_id = previousPublishedId;
    }

    // Step 1: Create container for this part (reply_to_id set above when i > 0).
    // Use /me/threads so reply_to_id is resolved in the token user's context (per Meta docs).
    const createRes = await fetch(
      `https://graph.threads.net/v1.0/me/threads?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: threadsFormBody(body),
      },
    );
    const createData = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!createRes.ok || !createData.id) {
      const errMsg =
        (createData as { error?: { message?: string } }).error?.message ??
        `Threads thread part ${i + 1} failed`;
      console.error("[Threads] Create container failed:", {
        part: i + 1,
        status: createRes.status,
        body: createData,
      });
      return {
        status: "failed",
        lastError: errMsg,
        error: "Create failed",
      };
    }

    // Container ID from step 1 — do NOT use as reply_to_id; only the threads_publish response id is valid.
    const containerId = createData.id;

    // Step 2: Poll container status until FINISHED (Threads API requires container to be ready before publish)
    const maxPollAttempts = 40;
    const pollDelayMs = 3000;
    let pollAttempt = 0;
    for (; pollAttempt < maxPollAttempts; pollAttempt++) {
      await sleep(pollDelayMs);
      const statusRes = await fetch(
        `https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&${threadParams.toString()}`,
      );
      if (!statusRes.ok) continue;
      const statusData = (await statusRes.json().catch(() => ({}))) as {
        status?: string;
        error_message?: string;
        error?: { message?: string };
      };
      const status = statusData.status;
      if (status === "FINISHED") break;
      if (status === "ERROR" || status === "EXPIRED") {
        const errMsg =
          statusData.error_message ??
          statusData.error?.message ??
          (status === "EXPIRED"
            ? "Threads media container expired. Try again."
            : "Threads media processing failed.");
        console.error("[Threads] Container not publishable:", {
          part: i + 1,
          status,
          error_message: statusData.error_message,
        });
        return {
          status: "failed",
          lastError: errMsg,
          error: "Container error",
        };
      }
      if (pollAttempt < maxPollAttempts - 1) {
        console.log(
          `[Threads] Part ${i + 1} container status: ${status ?? "unknown"} (attempt ${pollAttempt + 1}/${maxPollAttempts})`,
        );
      }
    }
    if (pollAttempt >= maxPollAttempts) {
      const err =
        "Threads media container did not become ready in time. Try again.";
      console.error("[Threads]", err);
      return { status: "failed", lastError: err, error: "Timeout" };
    }

    const publishRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: threadsFormBody({ creation_id: containerId }),
      },
    );
    const publishData = (await publishRes.json().catch(() => ({}))) as {
      id?: string;
      error?: {
        message?: string;
        error_user_msg?: string;
        error_user_title?: string;
      };
    };
    const publishedId = parseThreadsPublishId(publishData);
    if (!publishRes.ok || !publishedId) {
      const err = publishData.error;
      const errMsg =
        err?.error_user_msg ??
        (err?.error_user_title && err?.message
          ? `${err.error_user_title}: ${err.message}`
          : err?.message) ??
        "Threads publish failed";
      console.error("[Threads] Publish failed:", {
        part: i + 1,
        status: publishRes.status,
        body: publishData,
      });
      return {
        status: "failed",
        lastError: errMsg,
        error: "Publish failed",
      };
    }

    // Step 3: next part's reply_to_id must be this published media id, not the container id.
    previousPublishedId = publishedId;
    if (!firstPublishedId) firstPublishedId = publishedId;
    if (i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const rootId = firstPublishedId ?? previousPublishedId;
  const threadShortcode = rootId ? threadsMediaIdToShortcode(rootId) : "";
  const platformPostUrl =
    threadShortcode && pub.platformUsername
      ? `https://www.threads.net/@${pub.platformUsername}/post/${threadShortcode}`
      : pub.platformUsername
        ? `https://www.threads.net/@${pub.platformUsername}`
        : null;
  return {
    status: "published",
    platformPostId: rootId ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

async function publishToThreads(
  pub: Pub,
  post: Post,
  accessToken: string,
): Promise<PublishPlatformResult> {
  const threadParts = getThreadParts(post);
  if (threadParts && threadParts.length > 0) {
    return await publishThreadsThread(pub, threadParts, accessToken);
  }

  const threadsUserId = pub.platformUserId;
  const text = post.finalContent?.trim() ?? "";
  // Collection/carousel: up to 10 items in order, mixed images and videos
  const orderedMedia = post.mediaIds?.length
    ? (await getOrderedMediaWithUrls(post.mediaIds)).slice(0, 10)
    : [];
  const images = orderedMedia.filter((m) => m.mimeType.startsWith("image/"));
  const videos = orderedMedia.filter((m) => m.mimeType.startsWith("video/"));
  const imageUrl = images[0]?.url;
  const videoUrl = videos[0]?.url;

  const safeText = truncate(text, 500);
  if (orderedMedia.length === 0 && !safeText) {
    return {
      status: "failed",
      lastError: "Threads post must have text, an image, or a video.",
      error: "Content required",
    };
  }

  const threadParams = new URLSearchParams({ access_token: accessToken });
  let creationId: string;
  let isCarousel = false;

  // Handle carousel (multiple items: images and/or videos, up to 10)
  if (orderedMedia.length > 1) {
    console.log(
      `📸 Creating Threads carousel with ${orderedMedia.length} items (images + videos)...`,
    );

    const containerIds: string[] = [];

    for (const item of orderedMedia) {
      const isVideo = item.mimeType.startsWith("video/");
      const body: Record<string, string | boolean> = {
        media_type: isVideo ? "VIDEO" : "IMAGE",
        is_carousel_item: true,
        ...(isVideo ? { video_url: item.url } : { image_url: item.url }),
      };

      const itemRes = await fetch(
        `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      const itemData = (await itemRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string; code?: number; error_subcode?: number };
      };

      if (itemRes.ok && itemData.id) {
        containerIds.push(itemData.id);
        console.log(
          `✅ Threads carousel item ${containerIds.length} created: ${itemData.id}`,
        );

        // If this item is a video, poll until FINISHED before creating next item
        if (isVideo) {
          const maxAttempts = 60;
          const delayMs = 3000;
          let attempts = 0;
          console.log(
            `⏳ Polling Threads video item ${itemData.id} until FINISHED...`,
          );
          while (attempts < maxAttempts) {
            const statusRes = await fetch(
              `https://graph.threads.net/v1.0/${itemData.id}?fields=status&${threadParams.toString()}`,
            );
            if (statusRes.ok) {
              const statusData = (await statusRes.json().catch(() => ({}))) as {
                status?: string;
                error?: { message?: string };
              };
              const status = statusData.status;
              console.log(
                `Threads video item status: ${status ?? "unknown"} (attempt ${attempts + 1}/${maxAttempts})`,
              );
              if (status === "FINISHED") break;
              if (status === "ERROR") {
                const errMsg =
                  statusData.error?.message ??
                  "Threads video item processing failed";
                return {
                  status: "failed",
                  lastError: errMsg,
                  error: "Threads video processing error",
                };
              }
            }
            await sleep(delayMs);
            attempts++;
          }
          if (attempts >= maxAttempts) {
            const err = `Threads video item did not finish processing within ${maxAttempts * (delayMs / 1000)}s.`;
            console.error("❌", err);
            return { status: "failed", lastError: err, error: "Timeout" };
          }
          console.log("✅ Threads video item finished processing.");
        }
      } else {
        console.error(
          "❌ Failed to create Threads carousel item:",
          itemData.error,
        );
        return {
          status: "failed",
          lastError:
            itemData.error?.message ??
            "Failed to create Threads carousel item. Please try again.",
          error: "Threads carousel item failed",
        };
      }

      // space out carousel item creation so item IDs stay valid
      await sleep(1000);
    }

    if (containerIds.length === 0) {
      return {
        status: "failed",
        lastError: "Failed to upload carousel items",
        error: "Upload failed",
      };
    }

    // Wait before creating carousel container so items don't expire
    await sleep(8000);

    // Create carousel container
    const carouselRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: containerIds.join(","),
          text: safeText,
        }),
      },
    );

    const carouselData = (await carouselRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };

    if (!carouselRes.ok || !carouselData.id) {
      const err = carouselData.error?.message ?? `HTTP ${carouselRes.status}`;
      console.error("Threads carousel creation failed:", {
        status: carouselRes.status,
        error: carouselData.error,
      });
      return { status: "failed", lastError: err, error: err };
    }

    console.log("✅ Threads carousel container created:", {
      containerId: carouselData.id,
      itemCount: containerIds.length,
    });

    creationId = carouselData.id;
    isCarousel = true;
  } else if (orderedMedia.length === 1 && videoUrl) {
    // Single video
    const createRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "VIDEO",
          video_url: videoUrl,
          text: safeText,
        }),
      },
    );
    const createData = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!createRes.ok || !createData.id) {
      const err = createData.error?.message ?? `HTTP ${createRes.status}`;
      return { status: "failed", lastError: err, error: err };
    }
    creationId = createData.id;
    // Threads recommends waiting for video processing before publishing (at least 30s)
    await new Promise((r) => setTimeout(r, 30000));
  } else if (orderedMedia.length === 1 && imageUrl) {
    // Single image
    const createRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "IMAGE",
          image_url: imageUrl,
          text: safeText,
        }),
      },
    );
    const createData = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!createRes.ok || !createData.id) {
      const err = createData.error?.message ?? `HTTP ${createRes.status}`;
      return { status: "failed", lastError: err, error: err };
    }
    creationId = createData.id;
  } else {
    // Text-only post
    const createRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_type: "TEXT", text: safeText }),
      },
    );
    const createData = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!createRes.ok || !createData.id) {
      const err = createData.error?.message ?? `HTTP ${createRes.status}`;
      return { status: "failed", lastError: err, error: err };
    }
    creationId = createData.id;
  }

  // For carousel containers, poll status until ready before publishing.
  if (isCarousel) {
    let attempts = 0;
    const maxAttempts = 30;
    const delayMs = 3000;

    console.log(
      `⏳ Polling Threads carousel status for container ${creationId}...`,
    );

    while (attempts < maxAttempts) {
      const statusRes = await fetch(
        `https://graph.threads.net/v1.0/${creationId}?fields=status&${threadParams.toString()}`,
      );

      if (!statusRes.ok) {
        const errorText = await statusRes.text().catch(() => "Unknown error");
        console.warn(
          `⚠️ Threads carousel status check failed (attempt ${attempts + 1}/${maxAttempts}): HTTP ${statusRes.status}`,
          errorText,
        );
      } else {
        const statusData = (await statusRes.json().catch(() => ({}))) as {
          status?: string;
          error?: { message?: string };
        };
        const status = statusData.status;

        console.log(
          `Threads carousel status: ${status ?? "unknown"} (attempt ${
            attempts + 1
          }/${maxAttempts})`,
        );

        if (status === "FINISHED" || status === "PUBLISHED") {
          console.log("✅ Threads carousel is ready to publish");
          break;
        }

        if (status === "ERROR") {
          const errMessage =
            statusData.error?.message ??
            "Threads carousel container failed to process.";
          console.error("❌ Threads carousel processing error:", errMessage);
          return {
            status: "failed",
            lastError: errMessage,
            error: "Threads carousel not ready",
          };
        }
      }

      attempts += 1;
      await sleep(delayMs);
    }

    if (attempts >= maxAttempts) {
      const err =
        "Threads carousel container was never ready to publish (timed out after 90s).";
      console.error("❌", err);
      return { status: "failed", lastError: err, error: err };
    }
  } else {
    // Non-carousel posts: small grace delay before publish.
    await sleep(2000);
  }
  const publishRes = await fetch(
    `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish?${threadParams}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: creationId }),
    },
  );
  const publishData = (await publishRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!publishRes.ok) {
    const err = publishData.error?.message ?? `HTTP ${publishRes.status}`;
    return { status: "failed", lastError: err, error: err };
  }
  const publishedSingleId = parseThreadsPublishId(publishData);
  if (!publishedSingleId) {
    return {
      status: "failed",
      lastError: "Threads publish returned no media id",
      error: "Publish failed",
    };
  }
  const threadShortcode = threadsMediaIdToShortcode(publishedSingleId);
  const platformPostUrl =
    threadShortcode && pub.platformUsername
      ? `https://www.threads.net/@${pub.platformUsername}/post/${threadShortcode}`
      : pub.platformUsername
        ? `https://www.threads.net/@${pub.platformUsername}`
        : null;
  return {
    status: "published",
    platformPostId: publishedSingleId,
    platformPostUrl,
    publishedAt: new Date(),
  };
}
