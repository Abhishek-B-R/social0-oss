import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

/**
 * The presigner leaves Content-Type out of the signature by default
 * (`prepareRequest` adds it to `unsignableHeaders`), so whoever holds the URL
 * could PUT the object as `text/html` or `image/svg+xml` and R2 would serve
 * it that way from the public media origin. `signableHeaders` wins over that
 * set, binding the type passed here into the URL: a PUT with any other
 * Content-Type fails the signature check. A fresh Set per call: the
 * presigner mutates the header sets it is handed.
 */
function presignedPutSignedHeaders(): Set<string> {
  return new Set(["content-type"]);
}

/**
 * Generate a presigned PUT URL for direct client-to-R2 upload. The uploader
 * must send exactly `contentType` as its Content-Type header.
 * @param key - Object key (e.g. "uploads/userId/filename.ext")
 * @param contentType - MIME type
 * @param contentLength - File size in bytes
 * @param expiresIn - URL expiry in seconds (default 5 minutes)
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  contentLength: number,
  expiresIn = 300,
): Promise<string> {
  const client = getR2Client();
  const config = getR2Config();
  if (!config) {
    throw new Error("R2 is not configured");
  }
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  // Type assertion: client-s3 and s3-request-presigner bundle different @smithy/types, so Client/Command types are incompatible at compile time. Runtime is correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- smithy Client/Command type mismatch across AWS SDK packages
  return getSignedUrl(client as any, command as any, {
    expiresIn,
    signableHeaders: presignedPutSignedHeaders(),
  });
}

function getR2BucketName(): string {
  const config = getR2Config();
  if (!config) {
    throw new Error("R2 is not configured");
  }
  return config.bucketName;
}

/** Metadata for an uploaded object; null if missing. */
export async function getR2ObjectMetadata(
  key: string,
): Promise<{ contentLength: number; contentType?: string } | null> {
  const client = getR2Client();
  const bucket = getR2BucketName();
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (head.ContentLength == null) return null;
    return {
      contentLength: head.ContentLength,
      contentType: head.ContentType,
    };
  } catch {
    return null;
  }
}

/** Read a byte range from an R2 object (inclusive end). */
export async function getR2ObjectByteRange(
  key: string,
  start: number,
  end: number,
): Promise<Uint8Array> {
  const client = getR2Client();
  const bucket = getR2BucketName();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: `bytes=${start}-${end}`,
    }),
  );
  if (!response.Body) {
    throw new Error("Empty object body");
  }
  const bytes = await response.Body.transformToByteArray();
  return bytes;
}

/** Read a full R2 object (publish worker fallback when public URL fetch fails). */
export async function getR2ObjectBytes(key: string): Promise<Uint8Array> {
  const client = getR2Client();
  const bucket = getR2BucketName();
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!response.Body) {
    throw new Error("Empty object body");
  }
  return response.Body.transformToByteArray();
}

/** Delete an R2 object. Deleting a key that does not exist succeeds. */
export async function deleteR2Object(key: string): Promise<void> {
  const client = getR2Client();
  const bucket = getR2BucketName();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
