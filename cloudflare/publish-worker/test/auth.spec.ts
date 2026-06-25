import { describe, expect, it } from "vitest";
import {
  CF_PUBLISH_QUEUES,
  parseEnqueueRequest,
  verifyBearerAuth,
} from "../src/auth";

describe("verifyBearerAuth", () => {
  it("accepts matching bearer token", () => {
    const req = new Request("https://x/enqueue", {
      headers: { Authorization: "Bearer secret" },
    });
    expect(verifyBearerAuth(req, "secret")).toBe(true);
  });

  it("rejects missing or wrong token", () => {
    const req = new Request("https://x/enqueue");
    expect(verifyBearerAuth(req, "secret")).toBe(false);
    expect(verifyBearerAuth(req, undefined)).toBe(false);
  });
});

describe("parseEnqueueRequest", () => {
  it("parses platform jobs with priority", () => {
    const req = parseEnqueueRequest({
      priority: "now",
      job: {
        postId: "p1",
        userId: "u1",
        publicationId: "pub1",
        connectedAccountId: "acc1",
        platform: "twitter_x",
      },
    });
    expect(req?.priority).toBe("now");
    expect(req?.job.platform).toBe("twitter_x");
  });

  it("rejects invalid payloads", () => {
    expect(parseEnqueueRequest(null)).toBeNull();
    expect(parseEnqueueRequest({ priority: "nope", job: {} })).toBeNull();
    expect(
      parseEnqueueRequest({ priority: "now", job: { postId: "p", userId: "u" } }),
    ).toBeNull();
  });
});

describe("CF_PUBLISH_QUEUES", () => {
  it("defines now and scheduled queue names", () => {
    expect(CF_PUBLISH_QUEUES.NOW).toBe("social0-publish-now");
    expect(CF_PUBLISH_QUEUES.SCHEDULED).toBe("social0-publish-scheduled");
  });
});
