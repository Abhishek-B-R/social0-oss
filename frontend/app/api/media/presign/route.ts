import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { isR2Configured, getPresignedUploadUrl } from "@/lib/r2";
import { enforceRateLimit, uploadLimiter } from "@/lib/ratelimit";
import {
  ALLOWED_EXTENSIONS,
  isAllowedMediaContentType,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@/lib/media-upload-policy";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(uploadLimiter, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
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

  if (!isAllowedMediaContentType(contentType)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${contentType}` },
      { status: 400 },
    );
  }

  const isImage = contentType.startsWith("image/");
  const maxSize = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
  if (fileSize > maxSize) {
    return NextResponse.json(
      { error: `File too large. Max: ${isImage ? "50MB" : "500MB"}` },
      { status: 400 },
    );
  }

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
