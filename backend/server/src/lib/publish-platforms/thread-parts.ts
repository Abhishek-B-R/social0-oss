/**
 * Shared thread-parts parsing (used by Bluesky and Threads publishers).
 */

import type { Post, ThreadPart } from "./types";

export function getThreadParts(post: Post): ThreadPart[] | null {
  const md = post.metadata;
  if (!md || typeof md !== "object") return null;
  const tw = (md as Record<string, unknown>)["twitterThread"];
  if (!tw || typeof tw !== "object") return null;
  const partsVal = (tw as Record<string, unknown>)["parts"];
  if (!Array.isArray(partsVal) || partsVal.length === 0) return null;
  const parts: ThreadPart[] = [];
  for (const p of partsVal) {
    if (!p || typeof p !== "object") return null;
    const text = (p as Record<string, unknown>)["text"];
    const mediaIds = (p as Record<string, unknown>)["mediaIds"];
    parts.push({
      text: typeof text === "string" ? text : "",
      mediaIds: Array.isArray(mediaIds)
        ? mediaIds.filter((id): id is string => typeof id === "string")
        : [],
    });
  }
  return parts;
}
