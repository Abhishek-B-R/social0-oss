import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import {
  notImplemented,
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";
import { db } from "../../db/index.js";
import { mediaUploads } from "../../db/schema.js";
import { env } from "../../lib/env.js";
import {
  getPresignedUploadUrl,
  getR2ObjectByteRange,
  getR2ObjectMetadata,
  isR2Configured,
} from "../../lib/r2.js";
import { enforceRateLimit, uploadLimiter } from "../../lib/ratelimit.js";
import {
  ALLOWED_EXTENSIONS,
  contentTypeMatchesMagicBytes,
  isAllowedMediaContentType,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "../../lib/media-upload-policy.js";
import { sanitizeFilename } from "../../lib/validation.js";

const SIZE_TOLERANCE_BYTES = 1024;

export async function registerMediaApiRoutes(app: FastifyInstance) {
  app.post("/media/presign", async (request, reply) => {
    const actorUserId = await requireUserId(request);
    if (!actorUserId) return reply.status(401).send(unauthorized());

    const { requireWorkspacePermissionForUser } = await import(
      "../../lib/workspace/session.js"
    );
    const ws = await requireWorkspacePermissionForUser(
      actorUserId,
      "create_posts",
    );
    if (!ws.ok) {
      return reply.status(ws.statusCode).send({ error: ws.error });
    }
    const userId = ws.ctx.resourceUserId;

    const rate = await enforceRateLimit(uploadLimiter, actorUserId);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    if (!isR2Configured()) {
      return reply.status(503).send({
        error: "Media storage (R2) is not configured",
      });
    }

    const body = (request.body ?? {}) as {
      filename?: string;
      contentType?: string;
      fileSize?: number;
    };
    const { filename, contentType, fileSize } = body;

    if (!filename || !contentType || !fileSize) {
      return reply.status(400).send({
        error: "Missing required fields: filename, contentType, fileSize",
      });
    }

    if (!isAllowedMediaContentType(contentType)) {
      return reply.status(400).send({
        error: `Unsupported file type: ${contentType}`,
      });
    }

    const isImage = contentType.startsWith("image/");
    const maxSize = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
    if (fileSize > maxSize) {
      return reply.status(400).send({
        error: `File too large. Max: ${isImage ? "50MB" : "500MB"}`,
      });
    }

    const rawExt = (filename.split(".").pop() ?? "").toLowerCase();
    const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : "bin";
    const storageFilename = `${crypto.randomUUID()}.${ext}`;
    const key = `uploads/${userId}/${storageFilename}`;

    try {
      const presignedUrl = await getPresignedUploadUrl(
        key,
        contentType,
        fileSize,
      );
      return {
        presignedUrl,
        key,
        storageFilename,
      };
    } catch (e) {
      request.log.error(e, "Presign error");
      return reply.status(500).send({ error: "Failed to generate upload URL" });
    }
  });

  app.post("/media/confirm", async (request, reply) => {
    const actorUserId = await requireUserId(request);
    if (!actorUserId) return reply.status(401).send(unauthorized());

    const { requireWorkspacePermissionForUser } = await import(
      "../../lib/workspace/session.js"
    );
    const ws = await requireWorkspacePermissionForUser(
      actorUserId,
      "create_posts",
    );
    if (!ws.ok) {
      return reply.status(ws.statusCode).send({ error: ws.error });
    }
    const userId = ws.ctx.resourceUserId;

    if (!isR2Configured()) {
      return reply.status(503).send({
        error: "Media storage (R2) is not configured",
      });
    }

    const rate = await enforceRateLimit(uploadLimiter, actorUserId);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    const body = (request.body ?? {}) as {
      key?: string;
      storageFilename?: string;
      originalFilename?: string;
      contentType?: string;
      fileSize?: number;
    };

    const { key, storageFilename, originalFilename, contentType, fileSize } =
      body;

    if (
      !key ||
      !storageFilename ||
      !originalFilename ||
      !contentType ||
      !fileSize
    ) {
      return reply.status(400).send({ error: "Missing required fields" });
    }

    if (!isAllowedMediaContentType(contentType)) {
      return reply.status(400).send({
        error: `Unsupported file type: ${contentType}`,
      });
    }

    const expectedPrefix = `uploads/${userId}/`;
    if (!key.startsWith(expectedPrefix)) {
      return reply.status(403).send({ error: "Unauthorized" });
    }

    const expectedKey = `${expectedPrefix}${storageFilename}`;
    if (key !== expectedKey) {
      return reply.status(400).send({ error: "Invalid storage key" });
    }

    const isImage = contentType.startsWith("image/");
    const maxSize = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_VIDEO_SIZE_BYTES;
    if (fileSize <= 0 || fileSize > maxSize) {
      return reply.status(400).send({ error: "Invalid file size" });
    }

    const metadata = await getR2ObjectMetadata(key);
    if (!metadata) {
      return reply.status(400).send({
        error: "Upload not found. Finish uploading before confirming.",
      });
    }

    if (Math.abs(metadata.contentLength - fileSize) > SIZE_TOLERANCE_BYTES) {
      return reply.status(400).send({
        error: "Uploaded file size does not match",
      });
    }

    try {
      const magicBytes = await getR2ObjectByteRange(key, 0, 15);
      if (!contentTypeMatchesMagicBytes(contentType, magicBytes)) {
        return reply.status(400).send({
          error: "File content does not match declared type",
        });
      }
    } catch (e) {
      request.log.error(e, "Confirm upload magic-byte check failed");
      return reply
        .status(400)
        .send({ error: "Could not verify uploaded file" });
    }

    const base = (env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
    const publicUrl = `${base}/${key}`;

    const existing = await db.query.mediaUploads.findFirst({
      where: and(
        eq(mediaUploads.userId, userId),
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
      return existing;
    }

    try {
      const [row] = await db
        .insert(mediaUploads)
        .values({
          userId,
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
        return reply
          .status(500)
          .send({ error: "Failed to create media record" });
      }

      return row;
    } catch (e) {
      request.log.error(e, "Confirm upload error");
      return reply.status(500).send({
        error: e instanceof Error ? e.message : "Failed to save media record",
      });
    }
  });

  app.post("/media/upload", async () =>
    notImplemented("POST /api/media/upload - deprecated"),
  );
}
