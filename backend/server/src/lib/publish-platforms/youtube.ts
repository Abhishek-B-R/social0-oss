/**
 * YouTube Data API upload (Shorts and regular videos).
 */

import { publishLog } from "@/lib/publish-log";

import { truncate } from "@/lib/publish-validation";
import { getValidToken } from "@/lib/token-refresh";
import type { Post, Pub, PublishPlatformResult } from "./types";
import {
  fetchMediaByteRange,
  fetchMediaBytes,
  getMediaByteSize,
  getMediaWithUrls,
} from "./media";

/** Max size for YouTube uploads (Shorts and regular, up to 5 min). */
const YOUTUBE_MAX_VIDEO_BYTES = 512 * 1024 * 1024;
/**
 * Resumable-upload chunk. YouTube needs every chunk but the last to be a
 * multiple of 256 KiB. Reading and sending one chunk at a time keeps memory
 * at one chunk whatever the file size, which is what lets a 500 MB video go
 * through the 128 MB Cloudflare publish worker.
 */
export const YOUTUBE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
/** Chunk PUTs in a row that YouTube may answer without taking new bytes. */
const YOUTUBE_MAX_STALLED_CHUNKS = 3;

type ReadRange = (start: number, end: number) => Promise<Uint8Array<ArrayBuffer>>;

/** Next byte YouTube wants after a 308: one past the end of its `Range: bytes=0-N`. */
function nextOffsetAfter308(range: string | null): number {
  const match = range ? /bytes=\d+-(\d+)/.exec(range) : null;
  return match ? Number(match[1]) + 1 : 0;
}

/**
 * Send the file to a resumable-upload session in chunks. Returns YouTube's
 * final response (2xx with the video, or the error to report).
 */
async function uploadYouTubeChunks(
  uploadUrl: string,
  totalBytes: number,
  mimeType: string,
  readRange: ReadRange,
): Promise<Response> {
  let offset = 0;
  let stalled = 0;
  for (;;) {
    const end = Math.min(offset + YOUTUBE_UPLOAD_CHUNK_BYTES, totalBytes) - 1;
    const chunk = await readRange(offset, end);
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.byteLength),
        "Content-Type": mimeType,
        "Content-Range": `bytes ${offset}-${end}/${totalBytes}`,
      },
      body: chunk,
    });
    if (res.status !== 308) return res;

    await res.body?.cancel().catch(() => undefined);
    const next = nextOffsetAfter308(res.headers.get("range"));
    if (next >= totalBytes) {
      throw new Error("YouTube took every byte but did not finish the upload.");
    }
    stalled = next > offset ? 0 : stalled + 1;
    if (stalled >= YOUTUBE_MAX_STALLED_CHUNKS) {
      throw new Error("YouTube stopped accepting the upload. Try again later.");
    }
    offset = next;
  }
}
/** Duration threshold (seconds) for classifying as Short: ≤3 min vertical → Short, else regular. */
const YOUTUBE_SHORT_MAX_DURATION = 180;

export async function publishToYouTube(
  pub: Pub,
  post: Post,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  accessToken: string, // Unused - we get fresh token via getValidToken
): Promise<PublishPlatformResult> {
  // Get fresh token (auto-refreshes if needed; validates youtube.upload scope)
  let validToken: string;
  try {
    validToken = await getValidToken(pub.connectedAccountId, "youtube");
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to get valid token";
    return { status: "failed", lastError: errorMsg, error: errorMsg };
  }

  publishLog.info("🔍 YouTube publish attempt:", {
    accountId: pub.connectedAccountId,
    videoMediaCount: post.mediaIds?.length ?? 0,
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

  const videoMeta = (
    post.metadata as {
      video?: { durationSeconds?: number; isVertical?: boolean };
    }
  )?.video;
  const durationSeconds =
    typeof videoMeta?.durationSeconds === "number"
      ? videoMeta.durationSeconds
      : 0;
  const isVertical = videoMeta?.isVertical === true;
  const isShort = durationSeconds <= YOUTUBE_SHORT_MAX_DURATION && isVertical;

  const tooLarge: PublishPlatformResult = {
    status: "failed",
    lastError: `Video is too large for YouTube (max ${YOUTUBE_MAX_VIDEO_BYTES / 1024 / 1024}MB).`,
    error: "Video too large",
  };

  // Size first, so the cap is checked before anything is downloaded and the
  // upload can read the file in ranges. Only a file whose size nobody knows
  // is read whole, as before.
  const videoUrl = videoEntry.url;
  let totalBytes: number;
  let readRange: ReadRange;
  const knownBytes = await getMediaByteSize(videoUrl, videoEntry.sizeBytes);
  if (knownBytes != null) {
    if (knownBytes > YOUTUBE_MAX_VIDEO_BYTES) return tooLarge;
    totalBytes = knownBytes;
    readRange = (start, end) => fetchMediaByteRange(videoUrl, start, end);
  } else {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = new Uint8Array(await fetchMediaBytes(videoUrl));
    } catch (e) {
      const err = e instanceof Error ? e.message : "Failed to fetch video";
      return { status: "failed", lastError: err, error: err };
    }
    if (bytes.byteLength > YOUTUBE_MAX_VIDEO_BYTES) return tooLarge;
    if (bytes.byteLength === 0) {
      return { status: "failed", lastError: "Video file is empty", error: "No video" };
    }
    totalBytes = bytes.byteLength;
    readRange = async (start, end) => bytes.subarray(start, end + 1);
  }

  const videoMimeType = videoEntry.mimeType || "video/mp4";
  const meta = post.metadata as
    | {
        youtube?: { title?: string };
        video?: { durationSeconds?: number; isVertical?: boolean };
      }
    | undefined;
  const userTitle = meta?.youtube?.title?.trim();
  const fallbackTitle = truncate(post.finalContent?.trim() ?? "Short", 95);
  const title = isShort
    ? userTitle
      ? truncate(`${userTitle} #Shorts`, 100)
      : truncate(`${fallbackTitle} #Shorts`, 100)
    : userTitle
      ? truncate(userTitle, 100)
      : truncate(fallbackTitle, 100);
  const description = truncate(post.finalContent?.trim() ?? "", 5000);
  const snippet = {
    title,
    description: isShort
      ? description.includes("#Shorts")
        ? description
        : `${description}\n\n#Shorts`
      : description,
  };
  const metadata = {
    snippet,
    status: { privacyStatus: "public" as const },
  };

  const runUploadInit = (token: string) =>
    fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "x-upload-content-type": videoMimeType,
          "X-Upload-Content-Length": String(totalBytes),
        },
        body: JSON.stringify(metadata),
      },
    );

  let initRes = await runUploadInit(validToken);
  if (initRes.status === 401 || initRes.status === 403) {
    try {
      validToken = await getValidToken(pub.connectedAccountId, "youtube", {
        forceRefresh: true,
      });
      initRes = await runUploadInit(validToken);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to refresh YouTube token";
      return { status: "failed", lastError: errorMsg, error: errorMsg };
    }
  }

  if (!initRes.ok) {
    const errText = await initRes.text();
    let errMsg = `YouTube API: ${initRes.status}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) errMsg = errJson.error.message;
    } catch {
      // ignore
    }
    if (initRes.status === 401) {
      errMsg =
        "YouTube rejected the upload (unauthorized). Reconnect YouTube from Connections, then retry.";
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

  let uploadRes: Response;
  try {
    uploadRes = await uploadYouTubeChunks(
      uploadUrl,
      totalBytes,
      videoEntry.mimeType || "video/mp4",
      readRange,
    );
  } catch (e) {
    const err = e instanceof Error ? e.message : "YouTube upload failed";
    return { status: "failed", lastError: err, error: err };
  }

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

