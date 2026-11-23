import { describe, expect, it } from "vitest";
import { classifyPublicationError } from "../lib/publication-error-kind.js";

const failed = (error: string | null, tokenStatus?: string | null) =>
  classifyPublicationError({ error, status: "failed", tokenStatus });

describe("classifyPublicationError", () => {
  it("returns null for publications that did not fail", () => {
    expect(
      classifyPublicationError({ error: "old error", status: "published" }),
    ).toBeNull();
    expect(
      classifyPublicationError({ error: null, status: "pending" }),
    ).toBeNull();
    expect(classifyPublicationError({ error: "" })).toBeNull();
  });

  it("maps dead tokens to reconnect", () => {
    expect(failed("Request failed with code 401")).toBe("reconnect");
    expect(failed("Token expired - user must reconnect this account")).toBe(
      "reconnect",
    );
    expect(
      failed(
        "YouTube rejected the upload (unauthorized). Reconnect YouTube from Connections, then retry.",
      ),
    ).toBe("reconnect");
    expect(failed("Bluesky authentication expired. Please reconnect your account.")).toBe(
      "reconnect",
    );
    expect(
      failed(
        "Facebook needs updated permissions. Please disconnect and reconnect your Facebook Page from the dashboard so the app can request the required access.",
      ),
    ).toBe("reconnect");
  });

  it("maps raw Meta and TikTok dead-token messages to reconnect", () => {
    // Meta OAuthException code 190 (HTTP 400), stored verbatim by the
    // Facebook / Instagram / Threads publishers.
    expect(
      failed(
        "Error validating access token: Session has expired on Tuesday, 14-Oct-26 10:00:00 PDT. The current time is Tuesday, 21-Oct-26 09:12:44 PDT.",
      ),
    ).toBe("reconnect");
    expect(
      failed(
        "Error validating access token: The session has been invalidated because the user changed their password or Facebook has changed the session for security reasons.",
      ),
    ).toBe("reconnect");
    expect(
      failed(
        "Error validating access token: The user has not authorized application 1234567890.",
      ),
    ).toBe("reconnect");
    expect(failed("Invalid OAuth access token - Cannot parse access token")).toBe(
      "reconnect",
    );
    expect(failed("Invalid OAuth 2.0 Access Token")).toBe("reconnect");
    // TikTok code access_token_invalid.
    expect(
      failed("The access token is invalid or not found in the request."),
    ).toBe("reconnect");
    expect(failed("access_token_invalid")).toBe("reconnect");
  });

  it("treats an expired account as reconnect whatever the message", () => {
    expect(failed("Something odd happened", "expired")).toBe("reconnect");
  });

  it("ignores a stale expired status on never-expiring platforms", () => {
    const onPlatform = (platform: string) =>
      classifyPublicationError({
        error: "Something odd happened",
        status: "failed",
        tokenStatus: "expired",
        platform,
      });
    expect(onPlatform("twitter_x")).toBe("transient");
    expect(onPlatform("bluesky")).toBe("transient");
    expect(onPlatform("linkedin")).toBe("reconnect");
  });

  it("maps rejected content to content, even when the copy mentions reconnecting", () => {
    expect(failed("Bluesky post must be 3000 characters or less")).toBe("content");
    expect(failed("TikTok allows at most 35 images per post.")).toBe("content");
    expect(failed("Instagram requires at least one image or video")).toBe("content");
    expect(failed("Tweet content is empty")).toBe("content");
    expect(
      failed(
        "Bluesky image upload failed. Try a smaller image (max 1MB) or reconnect your account.",
      ),
    ).toBe("content");
    expect(
      failed(
        "Forbidden - This may happen if this tweet was already published-X won't post the exact same content twice.",
      ),
    ).toBe("content");
  });

  it("maps billing blocks to plan", () => {
    expect(failed("Payment required: your subscription has lapsed")).toBe("plan");
    expect(
      failed(
        "This team's Pro subscription is inactive. Ask the team owner to renew Pro so you can keep posting.",
      ),
    ).toBe("plan");
  });

  it("falls back to transient", () => {
    expect(failed("Couldn't reach the publishing service. Please try again.")).toBe(
      "transient",
    );
    expect(failed("Request failed with code 503")).toBe("transient");
    expect(failed(null)).toBe("transient");
  });
});
