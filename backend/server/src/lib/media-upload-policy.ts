export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/mov",
] as const;

export const ALLOWED_MEDIA_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
] as const;

export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "mp4",
  "mov",
  "webm",
]);

/**
 * Exactly what presign mints: `crypto.randomUUID()` plus an extension from
 * ALLOWED_EXTENSIONS (or `bin`). Confirm derives the storage key from this
 * name, so accepting an arbitrary one would let a caller register a key
 * containing `..` — object storage keeps that verbatim, but a CDN in front of
 * it may resolve the traversal.
 */
const GENERATED_STORAGE_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$/;

export function isGeneratedStorageFilename(name: string): boolean {
  return GENERATED_STORAGE_FILENAME.test(name);
}

export function isAllowedMediaContentType(
  contentType: string,
): contentType is AllowedMediaType {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(contentType);
}

/** Match declared MIME to file magic bytes (first bytes of object). */
export function contentTypeMatchesMagicBytes(
  contentType: string,
  bytes: Uint8Array,
): boolean {
  if (bytes.length < 4) return false;

  switch (contentType) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      );
    case "image/gif":
      return (
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38
      );
    case "image/webp":
      return (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
    case "video/mp4":
    case "video/quicktime":
    case "video/mov": {
      // ISO BMFF / QuickTime: "ftyp" at offset 4
      if (bytes.length < 8) return false;
      return (
        bytes[4] === 0x66 &&
        bytes[5] === 0x74 &&
        bytes[6] === 0x79 &&
        bytes[7] === 0x70
      );
    }
    case "video/webm":
      return (
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      );
    default:
      return false;
  }
}
