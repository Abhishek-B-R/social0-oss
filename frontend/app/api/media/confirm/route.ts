import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaUploads } from "@/db/schema";
import { sanitizeFilename } from "@/lib/validation";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Security: ensure the key belongs to this user
  if (!key.startsWith(`uploads/${session.user.id}/`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const base = (env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  const publicUrl = `${base}/${key}`;

  try {
    const [row] = await db
      .insert(mediaUploads)
      .values({
        userId: session.user.id,
        filename: storageFilename,
        originalFilename: sanitizeFilename(originalFilename),
        mimeType: contentType,
        sizeBytes: fileSize,
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
