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
import { getValidToken } from "@/lib/token-refresh";

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
      const photoRes = await fetch(
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
    const postRes = await fetch(
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

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/photos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
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

    const res = await fetch(
      `https://graph-video.facebook.com/v21.0/${pageId}/videos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
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

    const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

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

    const text = post.finalContent?.trim() ?? "";
    if (text.length > 3000) {
      return {
        status: "failed",
        lastError: "Bluesky post must be 3000 characters or less",
        error: "Content too long",
      };
    }

    // Get media if present
    const media = post.mediaIds?.length
      ? await getMediaWithUrls(post.mediaIds)
      : [];
    const images = media
      .filter((m) => m.mimeType.startsWith("image/"))
      .slice(0, 4); // Bluesky max 4 images
    const videos = media.filter((m) => m.mimeType.startsWith("video/"));

    // Upload images and get blob refs
    const imageBlobs: Array<{ alt: string; image: unknown }> = [];
    for (const img of images) {
      try {
        // Fetch image from URL
        const imageRes = await fetch(img.url);
        if (!imageRes.ok) {
          console.warn(`Failed to fetch image ${img.url}: ${imageRes.status}`);
          continue;
        }
        const imageBuffer = await imageRes.arrayBuffer();

        // Upload to Bluesky
        const uploadRes = await fetch(
          "https://bsky.social/xrpc/com.atproto.repo.uploadBlob",
          {
            method: "POST",
            headers: {
              "Content-Type": img.mimeType,
              Authorization: `Bearer ${jwt}`,
            },
            body: imageBuffer,
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

    // Upload video and get blob ref (Bluesky supports one video per post, max 100MB)
    let videoBlob: unknown | null = null;
    if (videos.length > 0) {
      const video = videos[0]; // Bluesky supports one video per post
      try {
        // Fetch video from URL
        const videoRes = await fetch(video.url);
        if (!videoRes.ok) {
          return {
            status: "failed",
            lastError: `Failed to fetch video: HTTP ${videoRes.status}`,
            error: "Video fetch failed",
          };
        }

        // Check video size (Bluesky limit: 100MB)
        const contentLength = videoRes.headers.get("content-length");
        const maxVideoSize = 100 * 1024 * 1024; // 100MB
        if (contentLength) {
          const size = parseInt(contentLength, 10);
          if (size > maxVideoSize) {
            return {
              status: "failed",
              lastError: `Video is too large for Bluesky (max ${maxVideoSize / 1024 / 1024}MB). Video is ${(size / 1024 / 1024).toFixed(1)}MB.`,
              error: "Video too large",
            };
          }
        }

        const videoBuffer = await videoRes.arrayBuffer();

        // Double-check size after fetching
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
              const blob =
                statusData.blob ?? statusData.jobStatus?.blob;

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

    // Add video embed if present (takes priority over images)
    if (videoBlob) {
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
  console.log("🔍 Instagram publish attempt:", {
    igUserId,
    tokenPrefix: accessToken.substring(0, 30),
  });
  const caption = truncate(post.finalContent?.trim() ?? "", 2200);
  const media = post.mediaIds?.length
    ? await getMediaWithUrls(post.mediaIds)
    : [];

  const images = media.filter((m) => m.mimeType.startsWith("image/"));
  const videos = media.filter((m) => m.mimeType.startsWith("video/"));
  const imageUrl = images[0]?.url;
  const videoUrl = videos[0]?.url;

  if (images.length === 0 && videos.length === 0) {
    const hint =
      post.mediaIds?.length && media.length === 0
        ? "Upload media through this app; external URLs are not allowed."
        : "Instagram requires at least one image or video.";
    return { status: "failed", lastError: hint, error: "No media" };
  }

  let containerData: {
    id?: string;
    error?: { message?: string; type?: string; code?: number };
  };

  // Handle carousel (multiple images)
  if (images.length > 1) {
    console.log(
      `📸 Creating Instagram carousel with ${images.length} images...`,
    );

    // Create container for each image
    const containerIds: string[] = [];

    for (const img of images.slice(0, 10)) {
      const itemRes = await fetch(
        `https://graph.instagram.com/v21.0/${igUserId}/media`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            image_url: img.url,
            is_carousel_item: true,
          }),
        },
      );

      const itemData = (await itemRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };

      if (itemRes.ok && itemData.id) {
        containerIds.push(itemData.id);
        console.log(
          `✅ Carousel item ${containerIds.length} created: ${itemData.id}`,
        );
      } else {
        console.error(`❌ Failed to create carousel item:`, itemData.error);
      }
    }

    if (containerIds.length === 0) {
      return {
        status: "failed",
        lastError: "Failed to upload carousel images",
        error: "Upload failed",
      };
    }

    // Wait a bit for items to process
    await new Promise((r) => setTimeout(r, 3000));

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
  } else if (images.length === 1) {
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
  } else if (videoUrl) {
    // Single video
    const containerBody: {
      caption?: string;
      video_url?: string;
      media_type?: string;
    } = {
      video_url: videoUrl,
      media_type: "REELS", // Videos must be posted as Reels
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
      mediaType: "video",
    });
  } else {
    return {
      status: "failed",
      lastError: "Instagram requires at least one image or video",
      error: "No media",
    };
  }

  // Step 2: Wait for media processing
  // Only poll status for single videos (not carousels)
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
  } else {
    // Images process quickly
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

  const platformPostUrl = publishData.id
    ? `https://www.instagram.com/p/${publishData.id}/`
    : null;

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

async function publishToTikTok(
  pub: Pub,
  post: Post,
  accessToken: string,
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

  // Base post_info shared by video and photo
  const basePostInfo: {
    privacy_level: string;
    title?: string;
    description?: string;
    disable_comment?: boolean;
    disable_duet?: boolean;
    disable_stitch?: boolean;
    brand_content_toggle?: boolean;
    brand_organic_toggle?: boolean;
  } = {
    privacy_level: accountSettings.privacy_level,
  };

  if (captionTruncated) {
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
    basePostInfo.brand_content_toggle = true;
    const hasOrganic =
      accountSettings.brand_organic ??
      accountSettings.brand_organic_toggle === true;
    const hasBranded =
      accountSettings.brand_content ??
      (accountSettings.brand_organic_toggle === false &&
        accountSettings.brand_content_toggle);
    if (hasOrganic && !hasBranded) {
      basePostInfo.brand_organic_toggle = true;
    } else if (hasBranded) {
      basePostInfo.brand_organic_toggle = false;
    }
  }

  let initRes: Response;
  if (isPhotoPost) {
    // Photo Post API: content/init with media_type PHOTO, post_mode DIRECT_POST
    const photoUrls = imageEntries.map((m) => m.url).filter(Boolean);
    if (photoUrls.length === 0) {
      return {
        status: "failed",
        lastError: "No valid image URLs.",
        error: "No images",
      };
    }

    // Build photo-specific post_info (no duet/stitch, different brand content structure)
    const photoPostInfo: {
      privacy_level: string;
      title?: string;
      description?: string;
      disable_comment?: boolean;
      brand_content_toggle?: boolean;
      brand_organic_toggle?: boolean;
    } = {
      privacy_level: accountSettings.privacy_level,
    };

    if (caption) {
      photoPostInfo.title = truncate(caption, 90); // Photo title max 90 UTF-16 runes
      photoPostInfo.description = truncate(caption, 4000); // Photo description max 4000
    }

    if (accountSettings.disable_comment) {
      photoPostInfo.disable_comment = true;
    }

    // Photo posts: brand_content_toggle and brand_organic_toggle are independent booleans
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

      if (hasBranded) {
        // "Branded content" selected: third-party paid partnership
        photoPostInfo.brand_content_toggle = true;
        photoPostInfo.brand_organic_toggle = false;
      } else if (hasOrganic) {
        // "Your brand" selected: creator's own business
        photoPostInfo.brand_organic_toggle = true;
        // brand_content_toggle stays false/undefined for "Your brand"
      }
    }

    const requestBody = {
      media_type: "PHOTO",
      post_mode: "DIRECT_POST",
      post_info: photoPostInfo,
      source_info: {
        source: "PULL_FROM_URL",
        photo_images: photoUrls,
        photo_cover_index: 0,
      },
    };

    console.log(
      "TikTok photo post request:",
      JSON.stringify(requestBody, null, 2),
    );

    initRes = await fetch(
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
    // Video: existing video/init flow
    initRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          post_info: basePostInfo,
          source_info: {
            source: "PULL_FROM_URL",
            video_url: videoEntry!.url,
          },
        }),
      },
    );
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
        `TikTok rejected or failed to process the ${isPhotoPost ? "photo" : "video"}.`;
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
  const images = media.filter((m) => m.mimeType.startsWith("image/"));
  const videos = media.filter((m) => m.mimeType.startsWith("video/"));
  const imageUrl = images[0]?.url;
  const videoUrl = videos[0]?.url;

  const safeText = truncate(text, 500);
  if (!imageUrl && !videoUrl && !safeText) {
    return {
      status: "failed",
      lastError: "Threads post must have text, an image, or a video.",
      error: "Content required",
    };
  }

  const threadParams = new URLSearchParams({ access_token: accessToken });
  let creationId: string;

  // Handle carousel (multiple images)
  if (images.length > 1) {
    console.log(`📸 Creating Threads carousel with ${images.length} images...`);

    // Create container for each image
    const containerIds: string[] = [];

    for (const img of images.slice(0, 20)) {
      const itemRes = await fetch(
        `https://graph.threads.net/v1.0/${threadsUserId}/threads?${threadParams}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            media_type: "IMAGE",
            image_url: img.url,
            is_carousel_item: true,
          }),
        },
      );

      const itemData = (await itemRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };

      if (itemRes.ok && itemData.id) {
        containerIds.push(itemData.id);
        console.log(
          `✅ Threads carousel item ${containerIds.length} created: ${itemData.id}`,
        );
      } else {
        console.error(
          `❌ Failed to create Threads carousel item:`,
          itemData.error,
        );
      }
    }

    if (containerIds.length === 0) {
      return {
        status: "failed",
        lastError: "Failed to upload carousel images",
        error: "Upload failed",
      };
    }

    // Wait a bit for items to process
    await new Promise((r) => setTimeout(r, 3000));

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
  } else if (videoUrl) {
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
  } else if (imageUrl) {
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
