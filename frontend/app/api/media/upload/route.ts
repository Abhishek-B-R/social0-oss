import { auth } from "@/lib/auth";
import { db } from "@/db";
import { mediaUploads } from "@/db/schema";
import { headers } from "next/headers";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
        error: `File too large. Max size: ${isImage ? "10MB" : "100MB"}`,
      },
      { status: 400 },
    );
  }

  // Unique filename for storage (when CDN is added, use this as object key)
  const ext = file.name.split(".").pop() || "bin";
  const storageFilename = `${crypto.randomUUID()}.${ext}`;

  try {
    const [row] = await db
      .insert(mediaUploads)
      .values({
        userId: session.user.id,
        filename: storageFilename,
        originalFilename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        status: "uploaded",
        // url/cdnUrl left null until CDN (S3/R2/CloudFront) is integrated
      })
      .returning({
        id: mediaUploads.id,
        filename: mediaUploads.filename,
        originalFilename: mediaUploads.originalFilename,
        mimeType: mediaUploads.mimeType,
        sizeBytes: mediaUploads.sizeBytes,
        status: mediaUploads.status,
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
      url: null, // Set when CDN is integrated
    });
  } catch (e) {
    console.error("Media upload error:", e);
    return Response.json({ error: "Failed to save media" }, { status: 500 });
  }
}
