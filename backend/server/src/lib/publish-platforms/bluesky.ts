/**
 * Bluesky / ATProto publish (single post and thread reply chains).
 */

import { publishLog } from "@/lib/publish-log";

import type { Post, Pub, PublishPlatformResult, ThreadPart } from "./types";
import { getThreadParts } from "./thread-parts";
import {
  partialThreadError,
  readThreadProgress,
  saveThreadProgress,
  threadFingerprint,
} from "./thread-progress";
import {
  fetchMediaBytes,
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

/** A blob uploaded for an embed, or the publish failure that stopped it. */
type BlueskyUploadOutcome =
  | { status: "uploaded"; blob: unknown }
  | PublishPlatformResult;

type BlueskyImageEmbed = { alt: string; image: unknown };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Upload image bytes to the user's PDS (falls back to bsky.social entryway). */
async function uploadBlueskyImageBlob(
  jwt: string,
  did: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ blob: unknown } | { error: string }> {
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
    let detail = errorText;
    try {
      const parsed = JSON.parse(errorText) as { message?: string; error?: string };
      detail = parsed.message ?? parsed.error ?? errorText;
    } catch {
      // not JSON: keep the raw text
    }
    return { error: `Bluesky rejected the image (${uploadRes.status}): ${detail.slice(0, 200)}` };
  }
  const uploadData = (await uploadRes.json()) as { blob?: unknown };
  if (!uploadData.blob) {
    return { error: "Bluesky did not return the uploaded image." };
  }
  return { blob: uploadData.blob };
}

/**
 * Compress and upload every image for one post. Fails on the first image that
 * does not make it: posting the text without media the user attached is worse
 * than a failed publication they can see and retry.
 */
async function uploadBlueskyImages(
  jwt: string,
  did: string,
  images: Array<{ url: string; mimeType: string }>,
  where: string,
): Promise<{ ok: true; embeds: BlueskyImageEmbed[] } | { ok: false; failure: PublishPlatformResult }> {
  const embeds: BlueskyImageEmbed[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    let reason: string;
    try {
      const imageBuffer = await fetchMediaBytes(img.url);
      const { buffer, contentType } = await prepareImageForPlatform(
        imageBuffer,
        "bluesky",
        img.mimeType,
      );
      const uploaded = await uploadBlueskyImageBlob(jwt, did, buffer, contentType);
      if ("blob" in uploaded) {
        embeds.push({ alt: "", image: uploaded.blob });
        continue;
      }
      reason = uploaded.error;
    } catch (error) {
      publishLog.error(`Error processing image ${img.url}:`, error);
      reason = errorMessage(error, "Could not process the image");
    }
    const label = images.length > 1 ? `image ${i + 1} of ${images.length}` : "the image";
    return {
      ok: false,
      failure: {
        status: "failed",
        lastError: `Could not upload ${label}${where} to Bluesky: ${reason}`,
        error: "Image upload failed",
      },
    };
  }
  return { ok: true, embeds };
}

/**
 * Upload one video to the Bluesky video service and wait for it to process
 * (Bluesky supports one video per post, max 100MB).
 */
async function uploadBlueskyVideo(
  jwt: string,
  did: string,
  video: { url: string; sizeBytes?: number | null },
): Promise<BlueskyUploadOutcome> {
  let videoBlob: unknown | null = null;
  const maxVideoSize = 100 * 1024 * 1024; // 100MB
  const tooLarge = (bytes: number): BlueskyUploadOutcome => ({
    status: "failed",
    lastError: `Video is too large for Bluesky (max ${maxVideoSize / 1024 / 1024}MB). Video is ${(bytes / 1024 / 1024).toFixed(1)}MB.`,
    error: "Video too large",
  });
  // Uploads go up to 500 MB: check the size recorded at upload before pulling
  // the file into memory, not after.
  if (typeof video.sizeBytes === "number" && video.sizeBytes > maxVideoSize) {
    return tooLarge(video.sizeBytes);
  }
  try {
    const videoBuffer = await fetchMediaBytes(video.url);
    if (videoBuffer.byteLength > maxVideoSize) {
      return tooLarge(videoBuffer.byteLength);
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
  if (!videoBlob) {
    return {
      status: "failed",
      lastError: "Bluesky did not return the uploaded video.",
      error: "No blob",
    };
  }
  return { status: "uploaded", blob: videoBlob };
}

type BlueskyEmbed =
  | { $type: "app.bsky.embed.images"; images: BlueskyImageEmbed[] }
  | { $type: "app.bsky.embed.video"; video: unknown; alt?: string };

/**
 * Publish a Bluesky thread (reply chain). Returns null to fall back to single-post.
 *
 * Media for every part is uploaded before the first record is created, so a
 * part whose image or video cannot be uploaded fails the publication instead
 * of posting that part as text only, or leaving half a thread on Bluesky.
 *
 * Each record created is saved as thread progress. When a later part fails,
 * the publication keeps the root post's URI and URL, and the next run (Retry)
 * replies to the last live part instead of creating a second root post.
 */
async function publishBlueskyThread(
  pub: Pub,
  post: Post,
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

  const fingerprint = threadFingerprint(parts);
  const saved = readThreadProgress(
    post.metadata,
    pub.publicationId,
    fingerprint,
    parts.length,
  );
  const startIndex = saved?.posted ?? 0;
  if (saved) {
    publishLog.info(
      `Bluesky thread ${pub.publicationId}: ${saved.posted} of ${parts.length} parts already live, continuing`,
    );
  }
  const profileKey = handle || did;
  const postUrl = (uri: string) => {
    const rkey = uri.split("/").pop();
    // Prefer handle (readable). Fall back to DID unencoded — encodeURIComponent
    // turns did:plc:… into did%3Aplc%3A… which bsky.app rejects.
    return rkey ? `https://bsky.app/profile/${profileKey}/post/${rkey}` : uri;
  };

  let rootRef: { uri: string; cid: string } | null = saved
    ? { uri: saved.rootId, cid: saved.rootCid ?? "" }
    : null;
  let parentRef: { uri: string; cid: string } | null = saved
    ? { uri: saved.lastId, cid: saved.lastCid ?? "" }
    : null;

  let posted = startIndex;

  const postParts = async (): Promise<PublishPlatformResult> => {
    // Parts already live need no media: their embeds stay unset.
    const embeds: Array<BlueskyEmbed | undefined> = [];
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const part = parts[partIndex];
      const where = parts.length > 1 ? ` in thread part ${partIndex + 1}` : "";
      if (partIndex < startIndex || part.mediaIds.length === 0) {
        embeds.push(undefined);
        continue;
      }
      const media = await getOrderedMediaWithUrls(part.mediaIds);
      if (media.length === 0) {
        publishLog.error("Bluesky: thread part mediaIds present but none resolved", {
          partIndex,
          mediaIds: part.mediaIds,
        });
        return {
          status: "failed",
          lastError: `Could not load attached media${where} for Bluesky. Re-upload it and try again.`,
          error: "Media not found",
        };
      }
      const images = media
        .filter((m) => m.mimeType.startsWith("image/"))
        .slice(0, 4);
      const videos = media.filter((m) => m.mimeType.startsWith("video/"));

      // A part with a video posts the video (images are ignored), as before.
      if (videos.length > 0) {
        const uploaded = await uploadBlueskyVideo(jwt, did, videos[0]);
        if (uploaded.status !== "uploaded") {
          return where
            ? { ...uploaded, lastError: `${uploaded.lastError ?? "Bluesky video upload failed"} (thread part ${partIndex + 1})` }
            : uploaded;
        }
        embeds.push({
          $type: "app.bsky.embed.video",
          video: uploaded.blob,
          alt: part.text || "",
        });
        continue;
      }

      if (images.length > 0) {
        const uploaded = await uploadBlueskyImages(jwt, did, images, where);
        if (!uploaded.ok) return uploaded.failure;
        embeds.push({ $type: "app.bsky.embed.images", images: uploaded.embeds });
        continue;
      }
      embeds.push(undefined);
    }

    for (let partIndex = startIndex; partIndex < parts.length; partIndex++) {
      const part = parts[partIndex];
      const record: Record<string, unknown> = {
        $type: "app.bsky.feed.post",
        text: part.text || "",
        createdAt: new Date().toISOString(),
      };
      const embed = embeds[partIndex];
      if (embed) record.embed = embed;
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
      posted = partIndex + 1;
      await saveThreadProgress(post.id, pub.publicationId, {
        fingerprint,
        posted,
        rootId: rootRef!.uri,
        rootCid: rootRef!.cid,
        lastId: ref.uri,
        lastCid: ref.cid,
      });
    }

    if (!rootRef) {
      return {
        status: "failed",
        lastError: "Bluesky thread could not be created.",
        error: "Thread failed",
      };
    }
    return {
      status: "published",
      platformPostId: rootRef.uri,
      platformPostUrl: postUrl(rootRef.uri),
      publishedAt: new Date(),
    };
  };

  let result: PublishPlatformResult;
  try {
    result = await postParts();
  } catch (e) {
    if (!rootRef) throw e;
    const err = e instanceof Error ? e.message : "Bluesky thread post failed";
    result = { status: "failed", lastError: err, error: err };
  }
  // Parts are live (from this run or an earlier one): the publication keeps
  // the root post, and the error says where a Retry picks up.
  const liveRoot = rootRef as { uri: string; cid: string } | null;
  if (result.status === "failed" && liveRoot) {
    return {
      ...result,
      platformPostId: liveRoot.uri,
      platformPostUrl: postUrl(liveRoot.uri),
      lastError: partialThreadError(
        result.lastError ?? result.error ?? "Bluesky thread post failed",
        posted,
        parts.length,
      ),
    };
  }
  return result;
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
        post,
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
    let imageBlobs: BlueskyImageEmbed[] = [];
    if (selectedImages.length > 0) {
      const uploaded = await uploadBlueskyImages(jwt, did, selectedImages, "");
      if (!uploaded.ok) return uploaded.failure;
      imageBlobs = uploaded.embeds;
    }

    // Upload video and get blob ref (Bluesky supports one video per post, max 100MB).
    // Only use video mode when there are no images in the post.
    let videoBlob: unknown | null = null;
    if (videos.length > 0 && selectedImages.length === 0) {
      const uploaded = await uploadBlueskyVideo(jwt, did, videos[0]);
      if (uploaded.status !== "uploaded") return uploaded;
      videoBlob = uploaded.blob;
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

    // Prefer handle; DID must stay unencoded (colons). Encoded DIDs 404 on bsky.app.
    const rkey = createData.uri?.split("/").pop();
    const profileKey = handle || did;
    const platformPostUrl = rkey
      ? `https://bsky.app/profile/${profileKey}/post/${rkey}`
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
