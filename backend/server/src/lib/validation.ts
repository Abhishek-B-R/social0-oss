/**
 * UUID validation regex (RFC 4122)
 */
import { z } from "zod";

/** ISO 8601 datetime — UTC (`Z`) or explicit offset (`+05:30`). */
export const isoDateTimeSchema = z.string().datetime({ offset: true });

/** scheduledAt on schedule endpoints — parsed by resolveScheduledAt (supports +default). */
export const scheduledAtInputSchema = z.string().min(1);

export const scheduleTimezoneSchema = z
  .union([z.literal("default"), z.string().min(1)])
  .optional();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate UUID format
 */
export function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

/**
 * Sanitize filename to prevent path traversal and special characters
 */
export function sanitizeFilename(filename: string): string {
  // Remove path components
  const basename = filename.split("/").pop() || filename;
  // Remove null bytes and control characters
  const sanitized = basename.replace(/[\x00-\x1f\x7f]/g, "");
  // Limit length
  return sanitized.slice(0, 255);
}

/**
 * Validate file content by checking magic bytes (file signatures)
 */
export async function validateFileContent(
  buffer: Buffer,
  expectedMimeType: string,
): Promise<boolean> {
  // Check magic bytes for common image/video formats
  const signatures: Record<string, Buffer[]> = {
    "image/jpeg": [Buffer.from([0xff, 0xd8, 0xff])],
    "image/png": [
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    "image/gif": [
      Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), // GIF87a
      Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), // GIF89a
    ],
    "image/webp": [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF (first 4 bytes)
    "video/mp4": [
      Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]), // ftyp at offset 4
      Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]), // ftyp at offset 4
    ],
    "video/quicktime": [
      Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74]), // ftyp qt
    ],
    "video/webm": [Buffer.from([0x1a, 0x45, 0xdf, 0xa3])], // EBML header
  };

  const expectedSignatures = signatures[expectedMimeType];
  if (!expectedSignatures) {
    // Unknown MIME type - allow but log warning
    return true;
  }

  const matchesStrict = expectedSignatures.some((sig) => {
    if (expectedMimeType === "image/webp") {
      // WebP: check for RIFF at start and WEBP at offset 8
      return (
        buffer.subarray(0, 4).equals(sig) &&
        buffer.subarray(8, 12).toString() === "WEBP"
      );
    }
    if (expectedMimeType.startsWith("video/mp4")) {
      // MP4: check for ftyp at various offsets
      return (
        buffer.length >= sig.length &&
        buffer.subarray(4, 4 + sig.length - 4).equals(sig.subarray(4))
      );
    }
    return buffer.subarray(0, sig.length).equals(sig);
  });
  if (matchesStrict) return true;

  // Lenient fallback for video: many MP4/MOV files use ISO base media (ftyp box at offset 4)
  if (
    (expectedMimeType === "video/mp4" || expectedMimeType === "video/quicktime") &&
    buffer.length >= 12
  ) {
    const ftyp = buffer.subarray(4, 8).toString();
    if (ftyp === "ftyp") return true;
  }

  return false;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
