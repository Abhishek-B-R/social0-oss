import { describe, expect, it } from "vitest";
import { PUBLISH_RETRY_DELAYS_SEC, publishRetryDelaySeconds } from "../lib/publish-retry.js";

/**
 * Failed publishes were acked and never retried, so a single 429 failed the
 * post. Only an answer that says the platform did not take the request is
 * retried; anything that might have created the post, or that a retry cannot
 * fix, fails as before.
 */
describe("publishRetryDelaySeconds", () => {
  it.each([
    "HTTP 429",
    "Too Many Requests",
    "Rate limit exceeded. Please wait.",
    "Application request limit reached (rate limited)",
  ])("retries %j with backoff", (error) => {
    expect(publishRetryDelaySeconds(error, 1)).toBe(30);
    expect(publishRetryDelaySeconds(error, 2)).toBe(60);
    expect(publishRetryDelaySeconds(error, 3)).toBe(120);
  });

  it("stops after the last backoff step", () => {
    expect(publishRetryDelaySeconds("HTTP 429", PUBLISH_RETRY_DELAYS_SEC.length + 1)).toBeNull();
  });

  it.each([
    // Might already be live: never automatic. Graph returns these after
    // media_publish / feed creates can already have made the post.
    "HTTP 500",
    "HTTP 503",
    "Service Unavailable",
    "An unexpected error has occurred. Please retry your request later.",
    "HTTP 502",
    "HTTP 504",
    "fetch failed",
    "Publishing was interrupted before the platform confirmed. The post may already be live: check the account before you retry.",
    // A retry cannot fix these.
    "HTTP 400",
    "HTTP 401",
    "Error validating access token: Session has expired",
    "Facebook needs updated permissions. Please disconnect and reconnect your Facebook Page.",
    "The caption is too long (HTTP 500)",
    "Duplicate content: status is a duplicate (HTTP 429)",
    "The request cannot be completed because you have exceeded your quota. (HTTP 403 quotaExceeded)",
    "Daily rate limit reached",
    "",
  ])("fails %j without retrying", (error) => {
    expect(publishRetryDelaySeconds(error, 1)).toBeNull();
  });

  it("keeps every wait under the unfinalized-post sweep's 5 minute grace", () => {
    expect(Math.max(...PUBLISH_RETRY_DELAYS_SEC)).toBeLessThan(5 * 60);
  });
});

describe("classifyPublicationError for interrupted deliveries", () => {
  it("gives the interrupted marker its own kind, never transient", async () => {
    const { classifyPublicationError } = await import("../lib/publication-error-kind.js");
    const { INTERRUPTED_PUBLISH_ERROR } = await import("@social0/shared");
    expect(classifyPublicationError({ error: INTERRUPTED_PUBLISH_ERROR, status: "failed" })).toBe(
      "interrupted",
    );
  });
});
