/**
 * Bluesky / ATProto publish (single post and thread reply chains).
 */

import { publishLog } from "@/lib/publish-log";

import type { Post, Pub, PublishPlatformResult, ThreadPart } from "./types";
import { getThreadParts } from "./thread-parts";
import {
  fetchMediaBytes,
  getMediaWithUrls,
  getOrderedMediaWithUrls,
  prepareImageForPlatform,
} from "./media";

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

/** Upload image bytes to the user's PDS (falls back to bsky.social entryway). */
async function uploadBlueskyImageBlob(
  jwt: string,
  did: string,
  buffer: Buffer,
  contentType: string,
): Promise<unknown | null> {
  const pds = await resolveDidToPds(did);
  const uploadUrl = pds
    ? `${pds.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`
    : "https://bsky.social/xrpc/com.atproto.repo.uploadBlob";
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Authorization: `Bearer ${jwt}`,
    },
    body: new Uint8Array(buffer),
  });
  if (!uploadRes.ok) {
    const errorText = await uploadRes.text().catch(() => "Unknown error");
    publishLog.warn(
      `Bluesky uploadBlob failed (${uploadRes.status}): ${errorText}`,
    );
    return null;
  }
  const uploadData = (await uploadRes.json()) as { blob?: unknown };
  return uploadData.blob ?? null;
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
        const uploadBlob = await uploadBlueskyImageBlob(
          jwt,
          did,
          buffer,
          contentType,
        );
        if (uploadBlob) imageBlobs.push({ alt: "", image: uploadBlob });
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
  // Prefer DID in the path (stable). Handle renames break handle-based URLs.
  const profileKey = did || handle;
  const platformPostUrl = rkey
    ? `https://bsky.app/profile/${encodeURIComponent(profileKey)}/post/${rkey}`
    : rootRef.uri;
  return {
    status: "published",
    platformPostId: rootRef.uri,
    platformPostUrl,
    publishedAt: new Date(),
  };
}

export async function publishToBluesky(
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
        "Collection posts not supported on Bluesky - use Image Post or Video Post instead.";
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
    if (post.mediaIds?.length && orderedMedia.length === 0) {
      publishLog.error("Bluesky: mediaIds present but none resolved for publish", {
        mediaIds: post.mediaIds,
      });
      return {
        status: "failed",
        lastError:
          "Could not load attached media for Bluesky. Re-upload the image and try again.",
        error: "Media not found",
      };
    }
    const images = orderedMedia.filter((m) => m.mimeType.startsWith("image/"));
    const videos = orderedMedia.filter((m) => m.mimeType.startsWith("video/"));
    const selectedImages = images.slice(0, 4);

    if (selectedImages.length > 0) {
      publishLog.info(`Bluesky collection: posting ${selectedImages.length} images, ignoring ${videos.length} videos`,);
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

        const uploadBlob = await uploadBlueskyImageBlob(
          jwt,
          did,
          buffer,
          contentType,
        );
        if (uploadBlob) {
          imageBlobs.push({
            alt: "",
            image: uploadBlob,
          });
        }
      } catch (error) {
        publishLog.error(`Error processing image ${img.url}:`, error);
        // Continue with other images
      }
    }

    if (selectedImages.length > 0 && imageBlobs.length === 0) {
      return {
        status: "failed",
        lastError:
          "Bluesky image upload failed. Try a smaller image (max 1MB) or reconnect your account.",
        error: "Image upload failed",
      };
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
          publishLog.error("Failed to get service auth:", errorText);
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
            publishLog.info("Video already processed, using existing result");
            if (errorData.blob) {
              videoBlob = errorData.blob;
            }
            uploadData = {
              jobId: errorData.jobId,
              blob: errorData.blob,
            };
          } else {
            publishLog.error(`Failed to upload video: ${uploadRes.status}`,
              errorData,);
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
          publishLog.info("✅ Video blob uploaded to Bluesky");
        } else if (uploadData.jobId) {
          // Step 3: Poll job status until video is processed
          publishLog.info("⏳ Polling video processing status...");
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

              publishLog.info(`Video processing status: ${jobState} (attempt ${retries + 1}/${maxRetries})`,);

              if (jobState === "JOB_STATE_COMPLETED") {
                if (blob) {
                  videoBlob = blob;
                  publishLog.info("✅ Video processed and ready");
                  break;
                }
                publishLog.warn("Bluesky returned JOB_STATE_COMPLETED but no blob; full response:",
                  JSON.stringify(statusData).slice(0, 500),);
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
        publishLog.error(`Error processing video ${video.url}:`, error);
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
      $type: "app.bsky.feed.post";
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
      $type: "app.bsky.feed.post",
      text: text || "",
      createdAt: new Date().toISOString(),
    };

    // Add video embed if present (takes priority over images) - but only when there are no images.
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
      publishLog.error("Bluesky createRecord failed:", {
        status: createRes.status,
        error: createData,
        record,
      });
      return { status: "failed", lastError: err, error: err };
    }

    // Build post URL — prefer DID (stored as the account's internal id).
    const rkey = createData.uri?.split("/").pop();
    const profileKey = did || handle;
    const platformPostUrl = rkey
      ? `https://bsky.app/profile/${encodeURIComponent(profileKey)}/post/${rkey}`
      : (createData.uri ?? null);

    return {
      status: "published",
      platformPostId: createData.uri ?? rkey ?? null,
      platformPostUrl,
      publishedAt: new Date(),
    };
  } catch (error) {
    publishLog.error("Bluesky publish error:", error);
    return {
      status: "failed",
      lastError: error instanceof Error ? error.message : "Unknown error",
      error: String(error),
    };
  }
}
