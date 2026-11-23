/**
 * Read a video's duration, size and a small poster frame with one <video>
 * load (the old tools loaded each file three times). Never rejects: unknown
 * values come back as 0 / "".
 */
export type VideoProbe = {
  durationSec: number;
  width: number;
  height: number;
  /** Small JPEG data URL for the thumbnail, or "" when unavailable. */
  posterUrl: string;
};

const POSTER_WIDTH = 160;
const PROBE_TIMEOUT_MS = 15_000;

export function probeVideo(file: File): Promise<VideoProbe> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    const result: VideoProbe = { durationSec: 0, width: 0, height: 0, posterUrl: "" };
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(finish, PROBE_TIMEOUT_MS);

    video.onerror = finish;
    video.onloadedmetadata = () => {
      result.durationSec = Number.isFinite(video.duration) ? video.duration : 0;
      result.width = video.videoWidth;
      result.height = video.videoHeight;
    };
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
      } catch {
        finish();
      }
    };
    video.onseeked = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w > 0 && h > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = POSTER_WIDTH;
          canvas.height = Math.max(1, Math.round((h / w) * POSTER_WIDTH));
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            result.posterUrl = canvas.toDataURL("image/jpeg", 0.8);
          }
        }
      } catch {
        // Poster is optional.
      }
      finish();
    };
    video.src = url;
  });
}
