import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { mediaUploads } from "../db/schema.js";

export async function resolveInboxMedia(
  resourceUserId: string,
  mediaId: string,
): Promise<{ url: string; mimeType: string } | { error: string }> {
  if (!mediaId.trim()) return { error: "mediaId required" };
  const rows = await db
    .select({ url: mediaUploads.url, mimeType: mediaUploads.mimeType })
    .from(mediaUploads)
    .where(and(eq(mediaUploads.id, mediaId), eq(mediaUploads.userId, resourceUserId)))
    .limit(1);
  const row = rows[0];
  if (!row?.url?.trim()) return { error: "Media not found or not ready" };
  return { url: row.url, mimeType: row.mimeType };
}
