import { config } from "../config.js";
import type { MediaUploadResult } from "../types/index.js";
import { apiClient } from "./client.js";

interface PresignResponse {
  presignedUrl: string;
  key: string;
  storageFilename: string;
}

export async function presignUpload(input: {
  filename: string;
  contentType: string;
  fileSize: number;
}): Promise<PresignResponse> {
  return apiClient.post<PresignResponse>(config.apiBase, "/media/presign", {
    filename: input.filename,
    contentType: input.contentType,
    fileSize: input.fileSize,
  });
}

export async function confirmUpload(input: {
  key: string;
  storageFilename: string;
  originalFilename: string;
  contentType: string;
  fileSize: number;
}): Promise<MediaUploadResult> {
  return apiClient.post<MediaUploadResult>(config.apiBase, "/media/confirm", input);
}

export async function uploadMediaBuffer(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<MediaUploadResult> {
  const presign = await presignUpload({
    filename: input.filename,
    contentType: input.mimeType,
    fileSize: input.buffer.byteLength,
  });

  await apiClient.putRaw(presign.presignedUrl, input.buffer, input.mimeType);

  return confirmUpload({
    key: presign.key,
    storageFilename: presign.storageFilename,
    originalFilename: input.filename,
    contentType: input.mimeType,
    fileSize: input.buffer.byteLength,
  });
}
