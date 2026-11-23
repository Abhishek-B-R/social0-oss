import {
  TwitterApi,
  type ITwitterApiClientPlugin,
  type TwitterApiTokens,
} from "twitter-api-v2";

/**
 * Per-request socket timeout for X calls made from the crons.
 *
 * twitter-api-v2 only arms a timeout when the request carries `timeout`, and
 * its convenience methods (`singleTweet`, `reply`, `retweet`, …) never set one.
 * A request stalled on a half-open keep-alive socket therefore never settled,
 * and the cron job running it held its BullMQ slot until the process restarted.
 */
export const X_REQUEST_TIMEOUT_MS = 15_000;

/** Give every request this client makes a timeout unless it already has one. */
export function requestTimeoutPlugin(timeoutMs: number): ITwitterApiClientPlugin {
  return {
    onBeforeRequestConfig({ params }) {
      if (params.timeout == null) params.timeout = timeoutMs;
    },
  };
}

/** OAuth 1.0a user client for the crons, with the request timeout applied. */
export function createXUserClient(tokens: TwitterApiTokens): TwitterApi {
  return new TwitterApi(tokens, {
    plugins: [requestTimeoutPlugin(X_REQUEST_TIMEOUT_MS)],
  });
}

export type XErrorKind =
  /** X answered 429: back off this account for the rest of the run. */
  | "rate_limited"
  /** X answered 408/5xx: a later run may well succeed. */
  | "server_error"
  /**
   * No (complete) response: network error, timeout, socket closed. For a read
   * this is a blip; for a write it is unknown whether X acted on it.
   */
  | "no_response"
  /** Any other 4xx (bad token, deleted tweet, forbidden) or a non-X error. */
  | "permanent";

/**
 * Classify an error thrown by twitter-api-v2.
 *
 * Duck-typed on the library's `type` / `code` fields rather than `instanceof`,
 * so a second copy of the package in the tree cannot misclassify it.
 */
export function classifyXError(err: unknown): XErrorKind {
  if (!err || typeof err !== "object") return "permanent";
  const { type, code } = err as { type?: unknown; code?: unknown };
  if (type === "request" || type === "partial-response") return "no_response";
  if (type === "response" && typeof code === "number") {
    if (code === 429) return "rate_limited";
    if (code === 408 || code >= 500) return "server_error";
  }
  return "permanent";
}
