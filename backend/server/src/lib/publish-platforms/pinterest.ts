/**
 * Pinterest API v5 pin creation (image and video).
 */

import { publishLog } from "@/lib/publish-log";

import { truncate } from "@/lib/publish-validation";
import type { Post, Pub, PublishPlatformResult } from "./types";
import { fetchMediaBytes, getMediaWithUrlsAndThumbnail } from "./media";

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
    publishLog.info(`[Pinterest] video status (attempt ${i + 1}):`,
      statusData.status,);
    if (statusData.status === "succeeded") break;
    if (statusData.status === "failed") {
      throw new Error(
        `Pinterest video processing failed: ${statusData.message ?? "unknown"}`,
      );
    }
  }

  return mediaId;
}

export async function publishToPinterest(
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
  publishLog.info("[Pinterest] pinPayload:", JSON.stringify(pinPayload, null, 2));
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
