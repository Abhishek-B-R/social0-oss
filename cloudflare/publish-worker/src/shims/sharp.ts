/**
 * Cloudflare Workers cannot load sharp (native libvips).
 * Video publish never needs it (PULL_FROM_URL). Image compress/TikTok photo
 * paths call into this stub and get a clear error instead of a native crash.
 */
export default function sharpUnavailable(): never {
  throw new Error(
    "Image processing (sharp) is not available on the Cloudflare publish worker. Use video posts, or process images on the API.",
  );
}
