/**
 * X/Twitter v2 create tweet via fetch + OAuth 1.0a.
 * CF Workers cannot use twitter-api-v2 (Node https.request / unenv).
 */
import { parseTwitterError } from "./twitter-errors.js";
import { twitterOAuthHeader } from "./twitter-oauth1.js";

const TWEETS_URL = "https://api.twitter.com/2/tweets";

export type CreateTwitterTweetPayload = {
  text: string;
  media?: { media_ids: string[] };
  reply?: { in_reply_to_tweet_id: string };
  made_with_ai?: boolean;
  paid_partnership?: boolean;
};

export type CreateTwitterTweetResult = {
  data: { id: string; text?: string };
};

/**
 * Create a tweet (or reply) with OAuth 1.0a user context.
 * Worker-safe: uses fetch, not Node https.request.
 */
export async function createTwitterTweetFetch(
  payload: CreateTwitterTweetPayload,
  accessToken: string,
  accessSecret: string,
): Promise<CreateTwitterTweetResult> {
  const authHeader = twitterOAuthHeader({
    url: TWEETS_URL,
    method: "POST",
    accessToken,
    accessSecret,
  });

  const res = await fetch(TWEETS_URL, {
    method: "POST",
    headers: {
      ...authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(parseTwitterError(data, res.status));
  }

  const tweet = data.data;
  if (!tweet || typeof tweet !== "object") {
    throw new Error("Twitter did not return tweet data");
  }
  const id = (tweet as Record<string, unknown>).id;
  if (typeof id !== "string" || !id) {
    throw new Error("Twitter did not return tweet ID");
  }

  return {
    data: {
      id,
      text:
        typeof (tweet as Record<string, unknown>).text === "string"
          ? ((tweet as Record<string, unknown>).text as string)
          : undefined,
    },
  };
}
