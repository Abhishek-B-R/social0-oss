/**
 * TikTok Content Posting API (video and photo).
 */

import { publishLog } from "@/lib/publish-log";

import { truncate } from "@/lib/publish-validation";
import {
  processImageForTikTok,
  TikTokImageError,
} from "@/lib/tiktok-photo-process";
import {
  buildTikTokProfileUrl,
  buildTikTokVideoUrl,
  isLikelyTikTokHandle,
  parseTikTokHandleFromProfileUrl,
  resolveTikTokProfileUrl,
} from "@/lib/platform-view-url";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  firstTikTokPublicVideoId,
  isTikTokVideoId,
  parseTikTokJson,
  storedTikTokPostId,
} from "@/lib/tiktok-post-id";
import type {
  Post,
  Pub,
  PublishPlatformResult,
  TikTokPlatformOptions,
} from "./types";
import { getMediaWithUrls } from "./media";

const TIKTOK_FETCH_TIMEOUT_MS = 15_000;
const TIKTOK_POLL_INTERVAL_MS = 4_000;
/**
 * TikTok often returns PUBLISH_COMPLETE before publicaly_available_post_id.
 * Keep polling so we can store a real /video/{id} link for View.
 * CF worker / API can wait longer than the old Vercel ~60s server-action cap.
 */
const TIKTOK_MAX_POLLS = 20;
/** Extra polls after PUBLISH_COMPLETE while waiting for the public video id. */
const TIKTOK_PUBLIC_ID_EXTRA_POLLS = 8;

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

async function tiktokApiJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return parseTikTokJson(text);
  } catch (err) {
    publishLog.error("TikTok: failed to parse JSON", err);
    return {};
  }
}

function resolveTikTokHandle(pub: Pub, profileUrl: string | null): string | null {
  if (pub.platformUsername && isLikelyTikTokHandle(pub.platformUsername)) {
    return pub.platformUsername.replace(/^@/, "").trim();
  }
  if (profileUrl) {
    const fromUrl = parseTikTokHandleFromProfileUrl(profileUrl);
    if (fromUrl && isLikelyTikTokHandle(fromUrl)) return fromUrl;
  }
  const metaUrl =
    typeof pub.platformMetadata?.profileUrl === "string"
      ? pub.platformMetadata.profileUrl
      : null;
  if (metaUrl) {
    const fromMeta = parseTikTokHandleFromProfileUrl(metaUrl);
    if (fromMeta && isLikelyTikTokHandle(fromMeta)) return fromMeta;
  }
  return null;
}

/**
 * On PUBLISH_COMPLETE, use publicaly_available_post_id for the public video URL
 * (https://www.tiktok.com/@{profile}/video/{id}; handle optional — /@/video/{id} works).
 * Inbox draft → messages URL. Profile-only if id missing (prefer profile over bare homepage).
 */
async function buildTikTokPublishedResult(
  pub: Pub,
  accessToken: string,
  opts: {
    platformPostId?: string | null;
    status?: string;
    publicIds?: unknown;
  },
): Promise<PublishPlatformResult> {
  let profileUrl: string | null;
  try {
    profileUrl = await resolveTikTokPublishedProfileUrl(pub, accessToken);
  } catch {
    profileUrl = resolveTikTokProfileUrl({
      platformUsername: pub.platformUsername,
      platformMetadata: pub.platformMetadata,
    });
  }

  if (opts.status === "SEND_TO_USER_INBOX") {
    return {
      status: "published",
      platformPostId: opts.platformPostId ?? null,
      platformPostUrl: "https://www.tiktok.com/messages?lang=en",
      publishedAt: new Date(),
    };
  }

  const publicVideoId =
    firstTikTokPublicVideoId(opts.publicIds) ??
    (opts.platformPostId && isTikTokVideoId(opts.platformPostId)
      ? opts.platformPostId
      : null);
  const handle = resolveTikTokHandle(pub, profileUrl);

  // Always store a video deep link when we have a public id - handle is optional.
  const platformPostUrl = publicVideoId
    ? buildTikTokVideoUrl(handle, publicVideoId)
    : (profileUrl ?? null);

  return {
    status: "published",
    platformPostId: publicVideoId ?? opts.platformPostId ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

/**
 * Prefer stored handle/profileUrl; otherwise try user.info for username /
 * profile_deep_link (may fail without extra scopes — that's fine).
 */
async function resolveTikTokPublishedProfileUrl(
  pub: Pub,
  accessToken: string,
): Promise<string | null> {
  const fromAccount = resolveTikTokProfileUrl({
    platformUsername: pub.platformUsername,
    platformMetadata: pub.platformMetadata,
  });
  if (fromAccount) return fromAccount;

  try {
    const fields = "username,profile_deep_link,display_name";
    const res = await tiktokApiFetch(
      `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      },
    );
    if (!res.ok) return null;
    const body = (await tiktokApiJson(res)) as {
      data?: {
        user?: {
          username?: string;
          profile_deep_link?: string;
        };
      };
      error?: { code?: string };
    };
    if (body.error?.code && body.error.code !== "ok") return null;
    const user = body.data?.user;
    const username =
      typeof user?.username === "string" ? user.username.trim() : "";
    if (username && isLikelyTikTokHandle(username)) {
      return buildTikTokProfileUrl(username);
    }
    const deepLink =
      typeof user?.profile_deep_link === "string"
        ? user.profile_deep_link.trim()
        : "";
    if (deepLink && /^https:\/\//i.test(deepLink)) return deepLink;
  } catch (err) {
    publishLog.warn("TikTok profile URL lookup failed:", err);
  }
  return null;
}

export async function publishToTikTok(
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
          post_as_draft?: boolean;
          mark_ai_generated?: boolean;
          video_title?: string;
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

  const postAsDraft = !!accountSettings.post_as_draft;
  const markAiGenerated = !!accountSettings.mark_ai_generated;

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

  const userTitle = accountSettings.video_title?.trim();
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
      photoPostInfo.auto_add_music = tiktokOptions?.autoAddMusic ?? true;
    }

    const userPhotoTitle = accountSettings.video_title?.trim();
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

    publishLog.info("TikTok photo post request:",
      JSON.stringify(requestBody, null, 2),);

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

  const initData = (await tiktokApiJson(initRes)) as {
    data?: { publish_id?: string };
    error?: { code?: string; message?: string; log_id?: string };
  };

  const mediaLabel = isPhotoPost ? "Image" : "Video";
  if (!initRes.ok || (initData.error?.code && initData.error.code !== "ok")) {
    publishLog.error(`TikTok publish/init (${isPhotoPost ? "photo" : "video"}) API response:`,
      {
        httpStatus: initRes.status,
        body: initData,
        errorCode: initData.error?.code,
        errorMessage: initData.error?.message,
      },);
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
    publishLog.error("TikTok publish/init: no publish_id in response", {
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
    const statusData = (await tiktokApiJson(statusRes)) as {
      data?: {
        status?: string;
        fail_reason?: string;
        publicaly_available_post_id?: unknown;
      };
      error?: { code?: string; message?: string };
    };
    return { statusRes, statusData };
  }

  let sawPublishComplete = false;
  let lastPublicIds: unknown;
  let publicIdWaitPolls = 0;

  // Poll until we have a public video id when possible — that id is what View needs.
  for (let i = 0; i < TIKTOK_MAX_POLLS; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, TIKTOK_POLL_INTERVAL_MS));
    }
    let statusRes: Response;
    let statusData: Awaited<
      ReturnType<typeof fetchTikTokPublishStatus>
    >["statusData"];
    try {
      ({ statusRes, statusData } = await fetchTikTokPublishStatus(publishId));
    } catch (err) {
      publishLog.error("TikTok publish/status: request failed", err);
      continue;
    }
    const status = statusData.data?.status;
    const publicIds = statusData.data?.publicaly_available_post_id;
    const publicVideoId = firstTikTokPublicVideoId(publicIds);
    if (publicIds != null) lastPublicIds = publicIds;

    if (
      status === "FAILED" ||
      (statusData.error && statusData.error.code !== "ok")
    ) {
      publishLog.error("TikTok publish/status API response (failure):", {
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

    if (status === "SEND_TO_USER_INBOX") {
      return buildTikTokPublishedResult(pub, accessToken, {
        platformPostId: publicVideoId,
        status,
        publicIds,
      });
    }

    if (status === "PUBLISH_COMPLETE") {
      sawPublishComplete = true;
      if (publicVideoId) {
        publishLog.info("[TikTok] Got public video id for View link:", {
          publicVideoId,
        });
        return buildTikTokPublishedResult(pub, accessToken, {
          platformPostId: publicVideoId,
          status,
          publicIds,
        });
      }
      // Complete but id not ready yet - keep polling a bit more.
      publicIdWaitPolls += 1;
      publishLog.info(
        "[TikTok] PUBLISH_COMPLETE without public id yet; waiting...",
        { poll: publicIdWaitPolls, publishId },
      );
      if (publicIdWaitPolls >= TIKTOK_PUBLIC_ID_EXTRA_POLLS) {
        break;
      }
      continue;
    }

    if (status && TIKTOK_ACCEPTED_STATUSES.has(status) && publicVideoId) {
      return buildTikTokPublishedResult(pub, accessToken, {
        platformPostId: publicVideoId,
        status,
        publicIds,
      });
    }
  }

  publishLog.warn(
    "[TikTok] Marking published without a guaranteed public video id",
    {
      publishId,
      sawPublishComplete,
      lastPublicIds,
    },
  );
  return buildTikTokPublishedResult(pub, accessToken, {
    platformPostId: storedTikTokPostId({
      publishId,
      publicIds: lastPublicIds,
    }),
    status: sawPublishComplete ? "PUBLISH_COMPLETE" : undefined,
    publicIds: lastPublicIds,
  });
}
