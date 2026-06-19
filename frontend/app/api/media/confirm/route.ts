import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaUploads } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sanitizeFilename } from "@/lib/validation";
import { env } from "@/lib/env";
import { enforceRateLimit, uploadLimiter } from "@/lib/ratelimit";
import {
  getR2ObjectByteRange,
  getR2ObjectMetadata,
  isR2Configured,
} from "@/lib/r2";
import {
  contentTypeMatchesMagicBytes,
  isAllowedMediaContentType,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@/lib/media-upload-policy";

const SIZE_TOLERANCE_BYTES = 1024;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Media storage (R2) is not configured" },
      { status: 503 },
    );
  }

  const rate = await enforceRateLimit(uploadLimiter, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  let body: {
    key: string;
    storageFilename: string;
    originalFilename: string;
    contentType: string;
    fileSize: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    key,
    storageFilename,
    originalFilename,
    contentType,
    fileSize,
  } = body;

  if (
    !key ||
    !storageFilename ||
    !originalFilename ||
    !contentType ||
    !fileSize
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  if (!isAllowedMediaContentType(contentType)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${contentType}` },
      { status: 400 },
    );
  }

  const expectedPrefix = `uploads/${session.user.id}/`;
  if (!key.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const expectedKey = `${expectedPrefix}${storageFilename}`;
  if (key !== expectedKey) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }

  const isImage = contentType.startsWith("image/");
  const maxSize = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
  if (fileSize <= 0 || fileSize > maxSize) {
    return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
  }

  const metadata = await getR2ObjectMetadata(key);
  if (!metadata) {
    return NextResponse.json(
      { error: "Upload not found. Finish uploading before confirming." },
      { status: 400 },
    );
  }

  if (
    Math.abs(metadata.contentLength - fileSize) > SIZE_TOLERANCE_BYTES
  ) {
    return NextResponse.json(
      { error: "Uploaded file size does not match" },
      { status: 400 },
    );
  }

  try {
    const magicBytes = await getR2ObjectByteRange(key, 0, 15);
    if (!contentTypeMatchesMagicBytes(contentType, magicBytes)) {
      return NextResponse.json(
        { error: "File content does not match declared type" },
        { status: 400 },
      );
    }
  } catch (e) {
    console.error("Confirm upload magic-byte check failed:", e);
    return NextResponse.json(
      { error: "Could not verify uploaded file" },
      { status: 400 },
    );
  }

  const base = (env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  const publicUrl = `${base}/${key}`;

  const existing = await db.query.mediaUploads.findFirst({
    where: and(
      eq(mediaUploads.userId, session.user.id),
      eq(mediaUploads.filename, storageFilename),
    ),
    columns: {
      id: true,
      filename: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      url: true,
    },
  });
  if (existing) {
    return NextResponse.json({
      id: existing.id,
      filename: existing.filename,
      originalFilename: existing.originalFilename,
      mimeType: existing.mimeType,
      sizeBytes: existing.sizeBytes,
      status: existing.status,
      url: existing.url,
    });
  }

  try {
    const [row] = await db
      .insert(mediaUploads)
      .values({
        userId: session.user.id,
        filename: storageFilename,
        originalFilename: sanitizeFilename(originalFilename),
        mimeType: contentType,
        sizeBytes: metadata.contentLength,
        status: "uploaded",
        url: publicUrl,
        cdnUrl: publicUrl,
      })
      .returning({
        id: mediaUploads.id,
        filename: mediaUploads.filename,
        originalFilename: mediaUploads.originalFilename,
        mimeType: mediaUploads.mimeType,
        sizeBytes: mediaUploads.sizeBytes,
        status: mediaUploads.status,
        url: mediaUploads.url,
      });

    if (!row) {
      return NextResponse.json(
        { error: "Failed to create media record" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: row.id,
      filename: row.filename,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      status: row.status,
      url: row.url,
    });
  } catch (e) {
    console.error("Confirm upload error:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Failed to save media record",
      },
      { status: 500 },
    );
  }
}
