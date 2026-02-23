import { auth } from "@/lib/auth";
import { db } from "@/db";
import { mediaUploads } from "@/db/schema";
import { headers } from "next/headers";
import { isR2Configured, uploadToR2 } from "@/lib/r2";
import { sanitizeFilename, validateFileContent } from "@/lib/validation";

const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB (bulk image upload)
const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024; // 500MB (bulk video upload)
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

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isR2Configured()) {
    return Response.json(
      { error: "Media storage (R2) is not configured" },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json(
      { error: "Missing or invalid file (use field name 'file')" },
      { status: 400 },
    );
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    return Response.json(
      {
        error: `Unsupported file type: ${file.type}. Allowed: images (${ALLOWED_IMAGE_TYPES.join(", ")}) and videos (${ALLOWED_VIDEO_TYPES.join(", ")})`,
      },
      { status: 400 },
    );
  }

  const maxSize = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
  if (file.size > maxSize) {
    return Response.json(
      {
        error: `File too large. Max size: ${isImage ? "50MB" : "500MB"}`,
      },
      { status: 400 },
    );
  }

  const ext = file.name.split(".").pop() || "bin";
  const storageFilename = `${crypto.randomUUID()}.${ext}`;
  const objectKey = `uploads/${session.user.id}/${storageFilename}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate file content matches declared MIME type
    const isValidContent = await validateFileContent(buffer, file.type);
    if (!isValidContent) {
      return Response.json(
        {
          error: `File content does not match declared type: ${file.type}`,
        },
        { status: 400 },
      );
    }

    const url = await uploadToR2(objectKey, buffer, file.type);

    const [row] = await db
      .insert(mediaUploads)
      .values({
        userId: session.user.id,
        filename: storageFilename,
        originalFilename: sanitizeFilename(file.name),
        mimeType: file.type,
        sizeBytes: file.size,
        status: "uploaded",
        url,
        cdnUrl: url,
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
      return Response.json(
        { error: "Failed to create media record" },
        { status: 500 },
      );
    }

    return Response.json({
      id: row.id,
      filename: row.filename,
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      status: row.status,
      url: row.url,
    });
  } catch (e) {
    console.error("Media upload error:", e);
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : "Failed to upload media to storage",
      },
      { status: 500 },
    );
  }
}
