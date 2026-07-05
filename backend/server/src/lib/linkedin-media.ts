/**
 * LinkedIn media upload helpers for UGC posts
 */

import { fetchAllowedMedia } from "@/lib/media-fetch.js";

export type LinkedInMediaType = "image" | "video";

/**
 * Upload an image to LinkedIn Assets API and return the digitalmediaAsset URN
 * Note: UGC Post API requires urn:li:digitalmediaAsset format (not urn:li:image)
 */
export async function uploadLinkedInImage(
  imageUrl: string,
  accessToken: string,
  personUrn: string,
): Promise<string> {
  // Step 1: Register upload using Assets API (required for UGC Post API)
  const registerRes = await fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    },
  );

  if (!registerRes.ok) {
    const errorData = (await registerRes.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const msg =
      (errorData.message as string) ||
      (errorData.error as string) ||
      registerRes.statusText;
    throw new Error(`LinkedIn image registration: ${msg}`);
  }

  const registerData = await registerRes.json();
  
  // Parse the nested response structure from Assets API
  const value = registerData.value as {
    uploadMechanism?: {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: {
        uploadUrl?: string;
      };
      "com.linkedin.digitalmedia.uploading.MultipartUpload"?: {
        partUploadRequests?: Array<{ url?: string }>;
      };
    };
    asset?: string;
  } | undefined;

  // Extract uploadUrl (can be from MediaUploadHttpRequest or MultipartUpload)
  let uploadUrl: string | undefined;
  if (
    value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl
  ) {
    uploadUrl =
      value.uploadMechanism[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ].uploadUrl;
  } else if (
    value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MultipartUpload"
    ]?.partUploadRequests?.[0]?.url
  ) {
    // For multipart, use first part URL
    uploadUrl =
      value.uploadMechanism[
        "com.linkedin.digitalmedia.uploading.MultipartUpload"
      ].partUploadRequests[0].url;
  }

  const assetUrn = value?.asset;

  if (!uploadUrl || !assetUrn) {
    throw new Error(
      `LinkedIn did not return uploadUrl or asset URN. Response: ${JSON.stringify(registerData)}`,
    );
  }

  // Step 2: Download image from R2 and upload to LinkedIn
  const imageRes = await fetchAllowedMedia(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch image from storage: ${imageRes.statusText}`);
  }

  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  
  // Detect content type from URL or default to JPEG
  let contentType = "image/jpeg";
  if (imageUrl.includes(".png") || imageUrl.toLowerCase().endsWith(".png")) {
    contentType = "image/png";
  } else if (imageUrl.includes(".gif") || imageUrl.toLowerCase().endsWith(".gif")) {
    contentType = "image/gif";
  } else if (imageUrl.includes(".webp") || imageUrl.toLowerCase().endsWith(".webp")) {
    contentType = "image/webp";
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: imageBuffer,
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    let errMsg = uploadRes.statusText;
    try {
      const parsed = JSON.parse(errBody) as Record<string, unknown>;
      errMsg =
        (parsed.message as string) ||
        (parsed.error as string) ||
        errBody.slice(0, 200) ||
        errMsg;
    } catch {
      if (errBody) errMsg = errBody.slice(0, 200);
    }
    throw new Error(`LinkedIn image upload: ${errMsg}`);
  }

  // Return digitalmediaAsset URN (required for UGC Post API)
  return assetUrn;
}

/**
 * Upload a video to LinkedIn Assets API and return the digitalmediaAsset URN
 * Note: UGC Post API requires urn:li:digitalmediaAsset format (not urn:li:video)
 * Uses Assets API with video recipe, not Videos API
 */
export async function uploadLinkedInVideo(
  videoUrl: string,
  accessToken: string,
  personUrn: string,
): Promise<string> {
  // Step 1: Download video from R2 to get file size
  const videoRes = await fetchAllowedMedia(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to fetch video from storage: ${videoRes.statusText}`);
  }

  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const totalSize = videoBuffer.length;

  // Step 2: Register upload using Assets API (required for UGC Post API)
  const registerRes = await fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    },
  );

  if (!registerRes.ok) {
    const errorData = (await registerRes.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const msg =
      (errorData.message as string) ||
      (errorData.error as string) ||
      registerRes.statusText;
    throw new Error(`LinkedIn video registration: ${msg}`);
  }

  const registerData = await registerRes.json();

  // Parse the nested response structure from Assets API
  const value = registerData.value as {
    uploadMechanism?: {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: {
        uploadUrl?: string;
      };
      "com.linkedin.digitalmedia.uploading.MultipartUpload"?: {
        partUploadRequests?: Array<{
          url?: string;
          firstByte?: number;
          lastByte?: number;
        }>;
      };
    };
    asset?: string;
  } | undefined;

  const assetUrn = value?.asset;
  if (!assetUrn) {
    throw new Error(
      `LinkedIn did not return asset URN. Response: ${JSON.stringify(registerData)}`,
    );
  }

  // Step 3: Upload video (single-part or multi-part)
  const singlePartUpload =
    value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;

  if (singlePartUpload) {
    // Single-part upload
    const uploadRes = await fetch(singlePartUpload, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": totalSize.toString(),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      let errMsg = uploadRes.statusText;
      try {
        const parsed = JSON.parse(errBody) as Record<string, unknown>;
        errMsg =
          (parsed.message as string) ||
          (parsed.error as string) ||
          errBody.slice(0, 200) ||
          errMsg;
      } catch {
        if (errBody) errMsg = errBody.slice(0, 200);
      }
      throw new Error(`LinkedIn video upload: ${errMsg}`);
    }
  } else {
    // Multi-part upload
    const multipartUpload =
      value?.uploadMechanism?.[
        "com.linkedin.digitalmedia.uploading.MultipartUpload"
      ]?.partUploadRequests;

    if (!multipartUpload || multipartUpload.length === 0) {
      throw new Error(
        `LinkedIn did not return upload URL or instructions. Response: ${JSON.stringify(registerData)}`,
      );
    }

    for (const part of multipartUpload) {
      if (!part.url || part.firstByte == null || part.lastByte == null) {
        continue;
      }

      const chunk = videoBuffer.subarray(part.firstByte, part.lastByte + 1);
      const chunkRes = await fetch(part.url, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": chunk.length.toString(),
        },
        body: chunk,
      });

      if (!chunkRes.ok) {
        throw new Error(
          `LinkedIn video chunk upload failed (bytes ${part.firstByte}-${part.lastByte}): ${chunkRes.statusText}`,
        );
      }
    }
  }

  // Return digitalmediaAsset URN (required for UGC Post API)
  return assetUrn;
}
