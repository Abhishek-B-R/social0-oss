/**
 * Platforms that historically needed the Node API (twitter-api-v2 / https.request).
 * Tweet create is now fetch-based and Workers-safe; this set remains for any
 * callers that still prefer routing X through the API server.
 */
export const SERVER_SIDE_PUBLISH_PLATFORMS = new Set(["twitter_x"]);
