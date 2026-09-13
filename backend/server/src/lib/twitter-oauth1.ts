import crypto from "crypto";
import OAuth from "oauth-1.0a";

/**
 * OAuth 1.0a request signing for the X endpoints the publish path calls with
 * fetch (tweet create and media upload) — CF Workers cannot run
 * `twitter-api-v2`, which needs Node's `https.request`.
 *
 * Both callers built this themselves, so the consumer credentials were read in
 * two places. They are read here.
 */
function twitterOAuth(): OAuth {
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
 * `data` carries the form fields that take part in the signature — omit it for
 * a JSON body, which OAuth 1.0a does not sign.
 */
export function twitterOAuthHeader(input: {
  url: string;
  method: string;
  accessToken: string;
  accessSecret: string;
  data?: Record<string, string>;
}): Record<string, string> {
  const oauth = twitterOAuth();
  return oauth.toHeader(
    oauth.authorize(
      { url: input.url, method: input.method, data: input.data },
      { key: input.accessToken, secret: input.accessSecret },
    ),
  ) as unknown as Record<string, string>;
}
