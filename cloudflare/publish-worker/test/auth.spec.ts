import { describe, expect, it } from "vitest";
import {
  CF_PUBLISH_QUEUES,
  parseEnqueueRequest,
  verifyEnqueueAuth,
} from "../src/auth";
import { signPublishRequestBody } from "@social0/shared";

const validJob = {
  postId: "11111111-1111-4111-8111-111111111111",
  userId: "user-1",
  publicationId: "22222222-2222-4222-8222-222222222222",
  connectedAccountId: "33333333-3333-4333-8333-333333333333",
  platform: "twitter_x",
};

describe("verifyEnqueueAuth", () => {
  it("accepts valid HMAC signatures", async () => {
    const body = JSON.stringify({ priority: "now", job: validJob });
    const { timestamp, signature } = await signPublishRequestBody(body, "secret");
    const req = new Request("https://x/enqueue", {
      method: "POST",
      headers: {
        "X-Publish-Timestamp": timestamp,
        "X-Publish-Signature": signature,
      },
      body,
    });
    expect(await verifyEnqueueAuth(req, "secret", body)).toBe(true);
  });

  it("rejects missing or wrong signature", async () => {
    const body = "{}";
    const req = new Request("https://x/enqueue", { method: "POST", body });
    expect(await verifyEnqueueAuth(req, "secret", body)).toBe(false);
    expect(await verifyEnqueueAuth(req, undefined, body)).toBe(false);
  });
});

describe("parseEnqueueRequest", () => {
  it("parses platform jobs with priority", () => {
    const req = parseEnqueueRequest({
      priority: "now",
      job: validJob,
    });
    expect(req?.priority).toBe("now");
    expect(req?.job.platform).toBe("twitter_x");
  });

  it("rejects invalid payloads", () => {
    expect(parseEnqueueRequest(null)).toBeNull();
    expect(parseEnqueueRequest({ priority: "nope", job: {} })).toBeNull();
    expect(
      parseEnqueueRequest({
        priority: "now",
        job: { postId: "p", userId: "u" },
      }),
    ).toBeNull();
    expect(
      parseEnqueueRequest({
        priority: "now",
        job: { ...validJob, platform: "not-a-platform" },
      }),
    ).toBeNull();
  });
});

describe("CF_PUBLISH_QUEUES", () => {
  it("defines now and scheduled queue names", () => {
    expect(CF_PUBLISH_QUEUES.NOW).toBe("social0-publish-now");
    expect(CF_PUBLISH_QUEUES.SCHEDULED).toBe("social0-publish-scheduled");
  });
});
