/**
 * Max allowed video duration in seconds (5 minutes).
 * Enforced in VideoPostForm, ThreadsPostForm, CollectionPostForm, and BulkToolsVideoClient.
 */
export const MAX_VIDEO_DURATION_SECONDS = 300;

export const VIDEO_DURATION_MESSAGE = `Videos must be less than 5 minutes (${MAX_VIDEO_DURATION_SECONDS} seconds).`;

/**
 * Get video duration in seconds from a File (client-only, uses video element).
 */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => {
      if (video.src) URL.revokeObjectURL(video.src);
    };
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      resolve(0);
    };
    video.src = URL.createObjectURL(file);
  });
}
