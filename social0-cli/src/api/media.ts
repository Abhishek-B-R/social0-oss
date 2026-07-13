import type { MediaUploadResult } from "../types/index.js";
import { getClient } from "./client.js";

interface PresignResponse {
  upload_url: string;
  key: string;
  storage_filename: string;
}

export async function presignUpload(input: {
  filename: string;
  contentType: string;
  fileSize: number;
}): Promise<PresignResponse> {
  return getClient().post<PresignResponse>("/media/presign", {
    filename: input.filename,
    content_type: input.contentType,
    size_bytes: input.fileSize,
  });
}

export async function confirmUpload(input: {
  key: string;
  storageFilename: string;
  originalFilename: string;
  contentType: string;
  fileSize: number;
}): Promise<MediaUploadResult> {
  return getClient().post<MediaUploadResult>("/media/confirm", {
    key: input.key,
    storage_filename: input.storageFilename,
    original_filename: input.originalFilename,
    content_type: input.contentType,
    size_bytes: input.fileSize,
  });
}

export async function uploadMediaBuffer(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  onProgress?: (pct: number) => void;
}): Promise<MediaUploadResult> {
  const presign = await presignUpload({
    filename: input.filename,
    contentType: input.mimeType,
    fileSize: input.buffer.byteLength,
  });

  input.onProgress?.(30);
  await getClient().putRaw(presign.upload_url, input.buffer, input.mimeType);
  input.onProgress?.(80);

  const result = await confirmUpload({
    key: presign.key,
    storageFilename: presign.storage_filename,
    originalFilename: input.filename,
    contentType: input.mimeType,
    fileSize: input.buffer.byteLength,
  });
  input.onProgress?.(100);
  return result;
}

export async function getMedia(mediaId: string): Promise<{
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  url: string | null;
}> {
  return getClient().get(`/media/${mediaId}`);
}
