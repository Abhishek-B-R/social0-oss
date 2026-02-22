import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function getR2Config() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    return null;
  }
  return { endpoint, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

/** Base URL for R2 (no trailing slash). Used to derive object key from a public URL. */
export function getR2PublicBaseUrl(): string | null {
  const url = getR2Config()?.publicUrl;
  return url ? url.replace(/\/$/, "") : null;
}

/**
 * If the given URL is under our R2 public URL, return the object key; otherwise null.
 * Used to build a -tiktok variant key for re-uploaded processed images.
 */
export function getR2KeyFromUrl(url: string): string | null {
  const base = getR2PublicBaseUrl();
  if (!base || !url.startsWith(base)) return null;
  const key = url.slice(base.length).replace(/^\//, "");
  return key || null;
}

export function getR2Client(): S3Client {
  const config = getR2Config();
  if (!config) {
    throw new Error(
      "R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL in .env.local",
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

/**
 * Upload a file to R2 and return the public URL.
 * @param key - Object key (e.g. "uploads/userId/filename.ext")
 * @param body - File buffer or Uint8Array
 * @param contentType - MIME type
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const config = getR2Config();
  if (!config) {
    throw new Error("R2 is not configured");
  }
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  const base = config.publicUrl.replace(/\/$/, "");
  return `${base}/${key}`;
}
