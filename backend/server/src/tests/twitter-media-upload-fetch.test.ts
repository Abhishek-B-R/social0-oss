import OAuth from "oauth-1.0a";
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadTwitterVideoFetch } from "../lib/twitter-media-upload-fetch.js";

describe("uploadTwitterVideoFetch OAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends APPEND as FormData media_data and signs oauth params only", async () => {
    process.env.TWITTER_CONSUMER_KEY = "test-key";
    process.env.TWITTER_CONSUMER_SECRET = "test-secret";

    const authorize = vi.spyOn(OAuth.prototype, "authorize");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body;
      if (body instanceof FormData) {
        return new Response(null, { status: 200 });
      }
      const params = new URLSearchParams(String(body ?? ""));
      const command = params.get("command");
      if (command === "INIT") {
        return Response.json({ media_id_string: "123" });
      }
      if (command === "FINALIZE") {
        return Response.json({
          media_id_string: "123",
          processing_info: { state: "succeeded" },
        });
      }
      return Response.json({ media_id_string: "123" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await uploadTwitterVideoFetch(
      Buffer.from("fake-video-bytes"),
      "video/mp4",
      "access-token",
      "access-secret",
    );

    const signedRequests = authorize.mock.calls.map(
      ([req]) => req as { data?: Record<string, string> },
    );
    expect(signedRequests.some((req) => req.data?.command === "INIT")).toBe(true);
    expect(signedRequests.some((req) => req.data?.command === "APPEND")).toBe(
      false,
    );

    const appendCall = fetchMock.mock.calls.find(
      ([, init]) => init?.body instanceof FormData,
    );
    expect(appendCall).toBeTruthy();
    const form = appendCall?.[1]?.body as FormData;
    expect(form.get("command")).toBe("APPEND");
    expect(form.get("media_id")).toBe("123");
    expect(form.get("segment_index")).toBe("0");
    expect(form.get("media_data")).toBe(
      Buffer.from("fake-video-bytes").toString("base64"),
    );
  });
});
