import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { mediaUploads } from "../db/schema.js";
import { env } from "../lib/env.js";
import {
  getPresignedUploadUrl,
  getR2ObjectByteRange,
  getR2ObjectMetadata,
  isR2Configured,
} from "../lib/r2.js";
import {
  ALLOWED_EXTENSIONS,
  contentTypeMatchesMagicBytes,
  isAllowedMediaContentType,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "../lib/media-upload-policy.js";
import { sanitizeFilename } from "../lib/validation.js";

const SIZE_TOLERANCE_BYTES = 1024;

export async function v1PresignMedia(
  userId: string,
  input: { filename: string; content_type: string; size_bytes: number },
): Promise<
  | {
      ok: true;
      upload_url: string;
      key: string;
      storage_filename: string;
    }
  | { ok: false; error: string }
> {
  if (!isR2Configured()) {
    return { ok: false, error: "Media storage is not configured" };
  }

  const { filename, content_type: contentType, size_bytes: fileSize } = input;

  if (!filename || !contentType || !fileSize) {
    return { ok: false, error: "filename, content_type, and size_bytes are required" };
  }

  if (!isAllowedMediaContentType(contentType)) {
    return { ok: false, error: `Unsupported file type: ${contentType}` };
  }

  const isImage = contentType.startsWith("image/");
  const maxSize = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
  if (fileSize > maxSize) {
    return { ok: false, error: `File too large. Max: ${isImage ? "50MB" : "500MB"}` };
  }

  const rawExt = (filename.split(".").pop() ?? "").toLowerCase();
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : "bin";
  const storageFilename = `${crypto.randomUUID()}.${ext}`;
  const key = `uploads/${userId}/${storageFilename}`;

  const presignedUrl = await getPresignedUploadUrl(key, contentType, fileSize);

  return {
    ok: true,
    upload_url: presignedUrl,
    key,
    storage_filename: storageFilename,
  };
}

export async function v1ConfirmMedia(
  userId: string,
  input: {
    key: string;
    storage_filename: string;
    original_filename: string;
    content_type: string;
    size_bytes: number;
  },
): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string }> {
  if (!isR2Configured()) {
    return { ok: false, error: "Media storage is not configured" };
  }

  const { key, storage_filename, original_filename, content_type, size_bytes } =
    input;

  const expectedPrefix = `uploads/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    return { ok: false, error: "Invalid upload key" };
  }

  const expectedKey = `${expectedPrefix}${storage_filename}`;
  if (key !== expectedKey) {
    return { ok: false, error: "Invalid storage key" };
  }

  const metadata = await getR2ObjectMetadata(key);
  if (!metadata) {
    return { ok: false, error: "Upload not found. Finish uploading before confirming." };
  }

  if (Math.abs(metadata.contentLength - size_bytes) > SIZE_TOLERANCE_BYTES) {
    return { ok: false, error: "Uploaded file size does not match" };
  }

  const head = await getR2ObjectByteRange(key, 0, 15);
  if (!head || !contentTypeMatchesMagicBytes(content_type, head)) {
    return { ok: false, error: "File content does not match declared type" };
  }

  const base = (env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  const publicUrl = `${base}/${key}`;

  const existing = await db.query.mediaUploads.findFirst({
    where: and(
      eq(mediaUploads.userId, userId),
      eq(mediaUploads.filename, storage_filename),
    ),
    columns: { id: true, url: true },
  });
  if (existing) {
    return { ok: true, id: existing.id, url: existing.url ?? publicUrl };
  }

  const [row] = await db
    .insert(mediaUploads)
    .values({
      userId,
      filename: storage_filename,
      originalFilename: sanitizeFilename(original_filename),
      mimeType: content_type,
      sizeBytes: metadata.contentLength,
      status: "uploaded",
      url: publicUrl,
      cdnUrl: publicUrl,
    })
    .returning({ id: mediaUploads.id, url: mediaUploads.url });

  if (!row) return { ok: false, error: "Failed to save media record" };

  return { ok: true, id: row.id, url: row.url ?? publicUrl };
}

export async function v1GetMedia(userId: string, mediaId: string) {
  const [row] = await db
    .select({
      id: mediaUploads.id,
      filename: mediaUploads.originalFilename,
      mimeType: mediaUploads.mimeType,
      sizeBytes: mediaUploads.sizeBytes,
      url: mediaUploads.url,
      status: mediaUploads.status,
      createdAt: mediaUploads.createdAt,
    })
    .from(mediaUploads)
    .where(and(eq(mediaUploads.id, mediaId), eq(mediaUploads.userId, userId)))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    filename: row.filename,
    content_type: row.mimeType,
    size_bytes: row.sizeBytes,
    url: row.url,
    status: row.status,
    created_at: row.createdAt?.toISOString() ?? null,
  };
}
