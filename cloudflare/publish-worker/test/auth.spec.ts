import { describe, expect, it } from "vitest";
import {
  ORCHESTRATOR_QUEUE,
  PLATFORM_QUEUE,
  parsePublishEnvelope,
  queueKindForBatch,
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

describe("parsePublishEnvelope", () => {
  it("parses orchestrator jobs", () => {
    const env = parsePublishEnvelope({
      kind: "orchestrator",
      job: { postId: "p1", userId: "u1" },
    });
    expect(env?.kind).toBe("orchestrator");
  });

  it("parses platform jobs", () => {
    const env = parsePublishEnvelope({
      kind: "platform",
      job: {
        postId: "p1",
        userId: "u1",
        publicationId: "pub1",
        connectedAccountId: "acc1",
        platform: "twitter_x",
      },
    });
    expect(env?.kind).toBe("platform");
  });

  it("rejects invalid payloads", () => {
    expect(parsePublishEnvelope(null)).toBeNull();
    expect(parsePublishEnvelope({ kind: "nope", job: {} })).toBeNull();
    expect(
      parsePublishEnvelope({ kind: "platform", job: { postId: "p", userId: "u" } }),
    ).toBeNull();
  });
});

describe("queueKindForBatch", () => {
  it("maps queue names", () => {
    expect(queueKindForBatch(ORCHESTRATOR_QUEUE)).toBe("orchestrator");
    expect(queueKindForBatch(PLATFORM_QUEUE)).toBe("platform");
    expect(queueKindForBatch("other")).toBeNull();
  });
});
