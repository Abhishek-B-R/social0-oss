import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { isR2Configured, getPresignedUploadUrl } from "@/lib/r2";
import { uploadLimiter } from "@/lib/ratelimit";

const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/mov",
];

// Explicit extension allowlist — derived from the content-type allowlists above.
// Used to sanitize the storage filename and prevent double-extension tricks.
const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp",
  "mp4", "mov", "webm",
]);

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limiting (moved from upload route)
  if (uploadLimiter) {
    const { success } = await uploadLimiter.limit(session.user.id);
    if (!success) {
      return NextResponse.json(
        { error: "Upload rate limit exceeded. Try again later." },
        { status: 429 },
      );
    }
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Media storage (R2) is not configured" },
      { status: 503 },
    );
  }

  let body: { filename: string; contentType: string; fileSize: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename, contentType, fileSize } = body;

  if (!filename || !contentType || !fileSize) {
    return NextResponse.json(
      { error: "Missing required fields: filename, contentType, fileSize" },
      { status: 400 },
    );
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(contentType);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(contentType);
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: `Unsupported file type: ${contentType}` },
      { status: 400 },
    );
  }

  const maxSize = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
  if (fileSize > maxSize) {
    return NextResponse.json(
      { error: `File too large. Max: ${isImage ? "50MB" : "500MB"}` },
      { status: 400 },
    );
  }

  // Extract and validate the extension against the explicit allowlist.
  // This prevents double-extension tricks (e.g. "malware.exe.jpg") and
  // ensures the stored extension always matches a known safe type.
  const rawExt = (filename.split(".").pop() ?? "").toLowerCase();
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : "bin";
  const storageFilename = `${crypto.randomUUID()}.${ext}`;
  const key = `uploads/${session.user.id}/${storageFilename}`;

  try {
    const presignedUrl = await getPresignedUploadUrl(
      key,
      contentType,
      fileSize,
    );
    return NextResponse.json({ presignedUrl, key, storageFilename });
  } catch (e) {
    console.error("Presign error:", e);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }
}