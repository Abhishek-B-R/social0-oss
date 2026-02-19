/**
 * Platform-specific publish logic for Facebook, Bluesky, Hashnode, YouTube,
 * Pinterest, Instagram, TikTok, Threads, and Dev.to.
 * Uses validation and allowlisted media URLs for security.
 */

import { db } from "@/db";
import { mediaUploads } from "@/db/schema";
import { inArray } from "drizzle-orm";
import {
  getAllowedMediaOrigins,
  isAllowedMediaUrl,
  validateContentLength,
  validateMediaCount,
  truncate,
} from "@/lib/publish-validation";

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

export async function publishToPlatform(
  pub: Pub,
  post: Post,
  accessToken: string,
  accessSecret: string | null,
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

  switch (pub.platform) {
    case "facebook":
      return publishToFacebook(pub, post, accessToken);
    case "bluesky":
      return publishToBluesky(pub, post, accessToken, accessSecret);
    case "hashnode":
      return publishToHashnode(pub, post, accessToken);
    case "youtube":
      return publishToYouTube(pub, post, accessToken);
    case "pinterest":
      return publishToPinterest(pub, post, accessToken);
    case "instagram":
      return publishToInstagram(pub, post, accessToken);
    case "tiktok":
      return publishToTikTok(pub, post, accessToken);
    case "threads":
      return publishToThreads(pub, post, accessToken);
    case "devto":
      return publishToDevTo(pub, post, accessToken);
    default:
      return {
        status: "failed",
        lastError: "Unknown platform",
        error: "Unknown platform",
      };
  }
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
  const firstImage = media.find((m) => m.mimeType.startsWith("image/"));
  const firstVideo = media.find((m) => m.mimeType.startsWith("video/"));

  const params = new URLSearchParams({
    access_token: pageAccessToken,
    message,
  });
  let endpoint = `https://graph.facebook.com/v21.0/${pageId}/feed`;
  let isVideo = false;
  if (firstImage?.url) {
    endpoint = `https://graph.facebook.com/v21.0/${pageId}/photos`;
    params.set("url", firstImage.url);
    params.set("caption", message);
    params.delete("message");
  } else if (firstVideo?.url) {
    // Page video publishing uses the Video API. Using a hosted URL keeps us from uploading bytes ourselves.
    // Use graph-video domain for video publishing per Meta docs.
    endpoint = `https://graph-video.facebook.com/v21.0/${pageId}/videos`;
    params.set("file_url", firstVideo.url);
    params.set("description", message);
    params.delete("message");
    isVideo = true;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as {
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
  const postId = data.post_id ?? data.id?.split("_")[1] ?? data.id;
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
  if (!appPassword) {
    return {
      status: "failed",
      lastError: "Bluesky app password missing. Reconnect the account.",
      error: "Bluesky app password missing",
    };
  }
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

  const text = post.finalContent?.trim() ?? "";
  if (!text) {
    return {
      status: "failed",
      lastError: "Post content is empty",
      error: "Post content is empty",
    };
  }
  if (text.length > 3000) {
    return {
      status: "failed",
      lastError: "Bluesky post must be 3000 characters or less",
      error: "Content too long",
    };
  }

  let embed:
    | {
        $type: string;
        images?: {
          image: { $type: string; ref: { $link: string } };
          alt: string;
        }[];
      }
    | undefined;
  if (post.mediaIds?.length) {
    const media = await getMediaWithUrls(post.mediaIds);
    const images = media
      .filter((m) => m.mimeType.startsWith("image/"))
      .slice(0, 4);
    if (images.length > 0) {
      const blobRefs: {
        image: { $type: string; ref: { $link: string } };
        alt: string;
      }[] = [];
      for (const img of images) {
        const blobRes = await fetch(img.url);
        if (!blobRes.ok) continue;
        const blob = await blobRes.blob();
        const uploadRes = await fetch(
          "https://bsky.social/xrpc/com.atproto.repo.uploadBlob",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${jwt}`,
              "Content-Type": img.mimeType,
            },
            body: blob,
          },
        );
        if (!uploadRes.ok) continue;
        const uploadData = (await uploadRes.json()) as {
          blob?: { ref?: { $link?: string } };
        };
        const link = uploadData.blob?.ref?.$link;
        if (link) {
          blobRefs.push({
            image: { $type: "blob", ref: { $link: link } },
            alt: "",
          });
        }
      }
      if (blobRefs.length > 0) {
        embed = { $type: "app.bsky.embed.images#main", images: blobRefs };
      }
    }
  }

  const record = {
    text,
    createdAt: new Date().toISOString(),
    ...(embed && { embed }),
  };
  const createRes = await fetch(
    `https://bsky.social/xrpc/com.atproto.repo.createRecord`,
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
    return { status: "failed", lastError: err, error: err };
  }
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
}

async function publishToHashnode(
  pub: Pub,
  post: Post,
  apiKey: string,
): Promise<PublishPlatformResult> {
  const publicationId = (
    pub.platformMetadata as { publicationId?: string } | null
  )?.publicationId;
  if (!publicationId) {
    return {
      status: "failed",
      lastError: "Hashnode publication ID missing. Reconnect the account.",
      error: "Publication ID missing",
    };
  }
  const content = post.finalContent?.trim() ?? "";
  if (!content) {
    return {
      status: "failed",
      lastError: "Post content is empty",
      error: "Post content is empty",
    };
  }
  const firstLine = content.split("\n")[0]?.slice(0, 100) ?? "Post";
  const title =
    firstLine.length === content.length ? firstLine : `${firstLine}...`;

  const input = { publicationId, title, contentMarkdown: content };

  // Try createPublicationStory (Hashnode Public API 2.0); fallback to createStory for older schema
  const mutations = [
    {
      name: "createPublicationStory",
      query: `
        mutation CreatePublicationStory($input: CreatePublicationStoryInput!) {
          createPublicationStory(input: $input) {
            post { id url }
          }
        }
      `,
      resultPath: "createPublicationStory",
    },
    {
      name: "createStory",
      query: `
        mutation CreateStory($input: CreateStoryInput!) {
          createStory(input: $input) {
            post { id url }
          }
        }
      `,
      resultPath: "createStory",
    },
  ] as const;

  for (const { query, resultPath } of mutations) {
    const res = await fetch("https://gql.hashnode.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables: { input } }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: Record<
        string,
        { post?: { id?: string; url?: string } } | undefined
      >;
      errors?: Array<{ message?: string }>;
    };
    if (data.errors?.length) {
      const errMsg = data.errors[0]?.message ?? "";
      if (errMsg.includes("Unknown") || errMsg.includes("doesn't exist"))
        continue;
      return { status: "failed", lastError: errMsg, error: errMsg };
    }
    if (!res.ok) continue;
    const postNode = data.data?.[resultPath]?.post;
    if (postNode) {
      return {
        status: "published",
        platformPostId: postNode.id ?? null,
        platformPostUrl: postNode.url ?? null,
        publishedAt: new Date(),
      };
    }
  }

  return {
    status: "failed",
    lastError:
      "Hashnode API did not accept the publish mutation. Check your publication ID and API token.",
    error: "Hashnode publish failed",
  };
}

/** Max size for YouTube Shorts (Shorts only; long videos not supported). ~60s is typically under 50MB. */
const YOUTUBE_SHORTS_MAX_BYTES = 50 * 1024 * 1024;

async function publishToYouTube(
  pub: Pub,
  post: Post,
  accessToken: string,
): Promise<PublishPlatformResult> {
  const media = post.mediaIds?.length
    ? await getMediaWithUrls(post.mediaIds)
    : [];
  const videoEntry = media.find((m) => m.mimeType.startsWith("video/"));
  if (!videoEntry?.url) {
    const hint =
      post.mediaIds?.length && media.length === 0
        ? "Upload video through this app; external URLs are not allowed."
        : "YouTube Shorts requires a video. Upload a short video (under 60 seconds).";
    return { status: "failed", lastError: hint, error: "No video" };
  }

  let videoBuffer: Buffer;
  try {
    const res = await fetch(videoEntry.url, { method: "GET" });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > YOUTUBE_SHORTS_MAX_BYTES) {
        return {
          status: "failed",
          lastError: `Video is too large for YouTube Shorts (max ${YOUTUBE_SHORTS_MAX_BYTES / 1024 / 1024}MB). Only short videos under 60 seconds are supported.`,
          error: "Video too large",
        };
      }
    }
    videoBuffer = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    const err = e instanceof Error ? e.message : "Failed to fetch video";
    return { status: "failed", lastError: err, error: err };
  }

  if (videoBuffer.length > YOUTUBE_SHORTS_MAX_BYTES) {
    return {
      status: "failed",
      lastError: `Video is too large for YouTube Shorts (max ${YOUTUBE_SHORTS_MAX_BYTES / 1024 / 1024}MB). Only short videos under 60 seconds are supported.`,
      error: "Video too large",
    };
  }

  const title = truncate(post.finalContent?.trim() ?? "Short", 95);
  const description = truncate(post.finalContent?.trim() ?? "", 450);
  const snippet = {
    title: title.includes("#Shorts") ? title : `${title} #Shorts`,
    description: description.includes("#Shorts")
      ? description
      : `${description}\n\n#Shorts`,
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
        Authorization: `Bearer ${accessToken}`,
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
    ? `https://www.youtube.com/shorts/${videoId}`
    : null;

  return {
    status: "published",
    platformPostId: videoId ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
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
        "Pinterest board not selected. Please reconnect Pinterest from the dashboard to choose a default board.",
      error: "No board",
    };
  }

  const media = post.mediaIds?.length
    ? await getMediaWithUrls(post.mediaIds)
    : [];
  const imageUrl = media.find((m) => m.mimeType.startsWith("image/"))?.url;
  if (!imageUrl) {
    const hint =
      post.mediaIds?.length && media.length === 0
        ? "Upload images through this app; external URLs are not allowed."
        : "Pinterest pins require at least one image.";
    return { status: "failed", lastError: hint, error: "No image" };
  }

  const rawDesc = post.finalContent?.trim() ?? "";
  const title = truncate(rawDesc, 100) || "Pin";
  const description = truncate(rawDesc, 500);
  const mimeType =
    media.find((m) => m.mimeType.startsWith("image/"))?.mimeType ??
    "image/jpeg";
  // Using sandbox API for trial access
  const res = await fetch("https://api-sandbox.pinterest.com/v5/pins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      board_id: boardId,
      title,
      description: description || undefined,
      media_source: {
        source_type: "image_url",
        url: imageUrl,
        content_type: mimeType,
      },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    link?: string;
    message?: string;
  };
  if (!res.ok) {
    const err = data.message ?? `HTTP ${res.status}`;
    return { status: "failed", lastError: err, error: err };
  }
  return {
    status: "published",
    platformPostId: data.id ?? null,
    platformPostUrl: data.link ?? null,
    publishedAt: new Date(),
  };
}

async function publishToInstagram(
  pub: Pub,
  post: Post,
  accessToken: string,
): Promise<PublishPlatformResult> {
  const igUserId = pub.platformUserId;
  const caption = truncate(post.finalContent?.trim() ?? "", 2200);
  const media = post.mediaIds?.length
    ? await getMediaWithUrls(post.mediaIds)
    : [];
  const imageUrl = media.find((m) => m.mimeType.startsWith("image/"))?.url;
  const videoUrl = media.find((m) => m.mimeType.startsWith("video/"))?.url;
  const mediaUrl = imageUrl ?? videoUrl;
  if (!mediaUrl) {
    const hint =
      post.mediaIds?.length && media.length === 0
        ? "Upload media through this app; external URLs are not allowed."
        : "Instagram requires one image or video.";
    return { status: "failed", lastError: hint, error: "No media" };
  }

  const containerRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: mediaUrl,
        caption: caption || undefined,
      }),
    },
  );
  const containerData = (await containerRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!containerRes.ok || !containerData.id) {
    const err = containerData.error?.message ?? `HTTP ${containerRes.status}`;
    return { status: "failed", lastError: err, error: err };
  }

  await new Promise((r) => setTimeout(r, 3000));
  const publishRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media_publish?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerData.id }),
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
  const platformPostUrl = publishData.id
    ? `https://www.instagram.com/p/${publishData.id}/`
    : null;
  return {
    status: "published",
    platformPostId: publishData.id ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

async function publishToTikTok(
  pub: Pub,
  post: Post,
  accessToken: string,
): Promise<PublishPlatformResult> {
  const media = post.mediaIds?.length
    ? await getMediaWithUrls(post.mediaIds)
    : [];
  const videoEntry = media.find((m) => m.mimeType.startsWith("video/"));
  if (!videoEntry?.url) {
    const hint =
      post.mediaIds?.length && media.length === 0
        ? "Upload video through this app; external URLs are not allowed."
        : "TikTok requires a video. Upload a video and try again.";
    return { status: "failed", lastError: hint, error: "No video" };
  }

  // Get TikTok settings from post metadata
  const tiktokMetadata = post.metadata?.tiktok as
    | Record<string, {
        privacy_level: string;
        disable_comment: boolean;
        disable_duet: boolean;
        disable_stitch: boolean;
        brand_content_toggle: boolean;
        brand_organic?: boolean; // "Your brand" checkbox
        brand_content?: boolean; // "Branded content" checkbox
        brand_organic_toggle?: boolean; // Legacy field for migration
      }>
    | undefined;

  const accountSettings = tiktokMetadata?.[pub.connectedAccountId];
  
  // Validate required fields
  if (!accountSettings || !accountSettings.privacy_level) {
    return {
      status: "failed",
      lastError:
        "TikTok privacy level is required. Please set TikTok post settings before publishing.",
      error: "Missing TikTok settings",
    };
  }
  
  // Validate branded content cannot be private
  if (accountSettings.brand_content && accountSettings.privacy_level === "SELF_ONLY") {
    return {
      status: "failed",
      lastError:
        "TikTok: Branded content visibility cannot be set to private. Please select Public or Friends.",
      error: "Invalid privacy for branded content",
    };
  }

  const caption = truncate(post.finalContent?.trim() ?? "", 2200);
  
  // Build post_info with TikTok settings
  const postInfo: {
    privacy_level: string;
    title?: string;
    disable_comment?: boolean;
    disable_duet?: boolean;
    disable_stitch?: boolean;
    brand_content_toggle?: boolean;
    brand_organic_toggle?: boolean;
  } = {
    privacy_level: accountSettings.privacy_level,
  };

  if (caption) {
    postInfo.title = caption;
  }

  // Add interaction toggles (only if disabled)
  if (accountSettings.disable_comment) {
    postInfo.disable_comment = true;
  }
  if (accountSettings.disable_duet) {
    postInfo.disable_duet = true;
  }
  if (accountSettings.disable_stitch) {
    postInfo.disable_stitch = true;
  }

  // Add brand content toggles (only if disclosure toggle is enabled)
  if (accountSettings.brand_content_toggle) {
    postInfo.brand_content_toggle = true;
    
    // Support both new (brand_organic, brand_content) and legacy (brand_organic_toggle) fields
    const hasOrganic = accountSettings.brand_organic ?? accountSettings.brand_organic_toggle === true;
    const hasBranded = accountSettings.brand_content ?? (accountSettings.brand_organic_toggle === false && accountSettings.brand_content_toggle);
    
    // TikTok API: brand_organic_toggle=true for "Your brand", false/omitted for "Branded content"
    // If both are selected, per guidelines: label as "Paid partnership" (send brand_organic_toggle=false)
    if (hasOrganic && !hasBranded) {
      // Only "Your brand" selected -> Brand Organic
      postInfo.brand_organic_toggle = true;
    } else if (hasBranded) {
      // "Branded content" selected (with or without "Your brand") -> Paid partnership
      // Per guidelines: if both selected, label as "Paid partnership"
      postInfo.brand_organic_toggle = false;
    }
  }

  const initRes = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        post_info: postInfo,
        source_info: {
          source: "PULL_FROM_URL",
          video_url: videoEntry.url,
        },
      }),
    },
  );

  const initData = (await initRes.json().catch((e) => {
    console.error("TikTok publish/init: failed to parse JSON", e);
    return {};
  })) as {
    data?: { publish_id?: string };
    error?: { code?: string; message?: string; log_id?: string };
  };

  // Log full TikTok API response before any error return (for debugging)
  if (!initRes.ok || (initData.error?.code && initData.error.code !== "ok")) {
    console.error("TikTok publish/init API response:", {
      httpStatus: initRes.status,
      body: initData,
      errorCode: initData.error?.code,
      errorMessage: initData.error?.message,
    });
  }

  if (!initRes.ok) {
    const err = initData.error?.message ?? `HTTP ${initRes.status}`;
    if (initData.error?.code === "url_ownership_unverified") {
      return {
        status: "failed",
        lastError:
          "Video URL domain is not verified in your TikTok app. Verify the domain in TikTok for Developers.",
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

  // Poll status briefly; TikTok pulls the video asynchronously for PULL_FROM_URL
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(
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
      data?: { status?: string; publicaly_available_post_id?: string[] };
      error?: { code?: string; message?: string };
    };
    const status = statusData.data?.status;

    if (status === "FAILED" || (statusData.error && statusData.error.code !== "ok")) {
      console.error("TikTok publish/status API response (failure):", {
        httpStatus: statusRes.status,
        body: statusData,
        errorCode: statusData.error?.code,
        errorMessage: statusData.error?.message,
      });
    }

    if (status === "PUBLISH_COMPLETE") {
      const postIds = statusData.data?.publicaly_available_post_id;
      const videoId = Array.isArray(postIds) ? postIds[0] : undefined;
      const platformPostUrl =
        videoId && pub.platformUsername
          ? `https://www.tiktok.com/@${pub.platformUsername}/video/${videoId}`
          : videoId
            ? `https://www.tiktok.com/video/${videoId}`
            : null;
      return {
        status: "published",
        platformPostId: videoId ?? publishId,
        platformPostUrl,
        publishedAt: new Date(),
      };
    }
    if (status === "FAILED") {
      const lastError =
        (statusData.error as { message?: string } | undefined)?.message ||
        "TikTok rejected or failed to process the video.";
      return {
        status: "failed",
        lastError,
        error: "Publish failed",
      };
    }
  }

  return {
    status: "published",
    platformPostId: publishId,
    platformPostUrl: null,
    publishedAt: new Date(),
  };
}

async function publishToThreads(
  pub: Pub,
  post: Post,
  accessToken: string,
): Promise<PublishPlatformResult> {
  const threadsUserId = pub.platformUserId;
  const text = post.finalContent?.trim() ?? "";
  const media = post.mediaIds?.length
    ? await getMediaWithUrls(post.mediaIds)
    : [];
  const imageUrl = media.find((m) => m.mimeType.startsWith("image/"))?.url;

  const safeText = truncate(text, 500);
  if (!imageUrl && !safeText) {
    return {
      status: "failed",
      lastError: "Threads post must have text or an image.",
      error: "Content required",
    };
  }
  const threadParams = new URLSearchParams({ access_token: accessToken });
  let creationId: string;
  if (imageUrl) {
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

  await new Promise((r) => setTimeout(r, 2000));
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
  const platformPostUrl = publishData.id
    ? `https://www.threads.net/@${pub.platformUsername ?? "user"}/post/${publishData.id}`
    : null;
  return {
    status: "published",
    platformPostId: publishData.id ?? null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

async function publishToDevTo(
  pub: Pub,
  post: Post,
  apiKey: string,
): Promise<PublishPlatformResult> {
  const bodyMarkdown = post.finalContent?.trim() ?? "";
  if (!bodyMarkdown) {
    return {
      status: "failed",
      lastError: "Article content is empty",
      error: "Content is empty",
    };
  }
  const firstLine = bodyMarkdown.split("\n")[0]?.slice(0, 100) ?? "Article";
  const title =
    firstLine.length === bodyMarkdown.length ? firstLine : `${firstLine}...`;

  const res = await fetch("https://dev.to/api/articles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      article: {
        title,
        body_markdown: bodyMarkdown,
        published: true,
      },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: number;
    url?: string;
    error?: string;
  };
  if (!res.ok) {
    const err = data.error ?? `HTTP ${res.status}`;
    return { status: "failed", lastError: err, error: err };
  }
  const platformPostUrl =
    data.url ??
    (data.id
      ? `https://dev.to/${pub.platformUsername ?? "user"}/${data.id}`
      : null);
  return {
    status: "published",
    platformPostId: data.id != null ? String(data.id) : null,
    platformPostUrl,
    publishedAt: new Date(),
  };
}
