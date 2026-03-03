"use client";

export type ComposerMediaItem = {
  type: "image" | "video";
  file: File;
  previewUrl: string;
};

export type ComposerThreadPost = {
  text: string;
  media: ComposerMediaItem[];
};

export type ComposerPayload = {
  text: string;
  isThread: boolean;
  media: ComposerMediaItem[];
  /** When isThread is true, additional posts for the thread (Post 2, Post 3, ...). */
  threadPosts?: ComposerThreadPost[];
};

let currentPayload: ComposerPayload | null = null;

export function setComposerPayload(payload: ComposerPayload) {
  currentPayload = payload;
}

/** Returns the payload without clearing it. Use so React Strict Mode's double effect run still gets the payload. */
export function getComposerPayload(): ComposerPayload | null {
  return currentPayload;
}

export function clearComposerPayload() {
  currentPayload = null;
}

/** Use in forms: read payload (does not clear). Clear in effect cleanup with a short delay so Strict Mode's second run still sees it. */
export function consumeComposerPayload(): ComposerPayload | null {
  return getComposerPayload();
}

