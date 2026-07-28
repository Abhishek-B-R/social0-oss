/**
 * X/Twitter v2 create tweet via fetch + OAuth 1.0a.
 * CF Workers cannot use twitter-api-v2 (Node https.request / unenv).
 */
import crypto from "crypto";
import OAuth from "oauth-1.0a";
import { parseTwitterError } from "./twitter-errors.js";

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

function getOAuth(): OAuth {
  const consumerKey = process.env.TWITTER_CONSUMER_KEY;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error("Twitter consumer key/secret not configured");
  }
  return new OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base: string, key: string) {
      return crypto.createHmac("sha1", key).update(base).digest("base64");
    },
  });
}

/**
 * Create a tweet (or reply) with OAuth 1.0a user context.
 * Worker-safe: uses fetch, not Node https.request.
 */
export async function createTwitterTweetFetch(
  payload: CreateTwitterTweetPayload,
  accessToken: string,
  accessSecret: string,
): Promise<CreateTwitterTweetResult> {
  const oauth = getOAuth();
  const authHeader = oauth.toHeader(
    oauth.authorize(
      { url: TWEETS_URL, method: "POST" },
      { key: accessToken, secret: accessSecret },
    ),
  ) as unknown as Record<string, string>;

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
