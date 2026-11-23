import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchScheduledTarget,
  dispatchTargetFor,
  requestServerFinalize,
  SERVER_FINALIZE_TIMEOUT_MS,
  serverPublishBaseUrl,
} from "../cron/dispatch-scheduled-target.js";

const ENV_KEYS = [
  "TWITTER_PUBLISH_ON_CF",
  "TIKTOK_PUBLISH_ON_CF",
  "BLUESKY_PUBLISH_ON_CF",
  "CRON_SECRET",
  "INTERNAL_API_BASE_URL",
  "API_BASE_URL",
  "AUTH_API_URL",
  "CF_PUBLISH_WORKER_URL",
  "CF_PUBLISH_HMAC_SECRET",
] as const;

const saved = new Map<string, string | undefined>(
  ENV_KEYS.map((k) => [k, process.env[k]]),
);

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

/**
 * The scheduled path used to send every platform to Cloudflare while
 * "publish now" kept X and TikTok on Node — so the same post published two
 * different ways depending on which button created it, and the scheduled one
 * took the path the repo documents as broken for X.
 */
describe("dispatchTargetFor", () => {
  it("keeps X and TikTok on the API by default", () => {
    delete process.env.TWITTER_PUBLISH_ON_CF;
    delete process.env.TIKTOK_PUBLISH_ON_CF;
    expect(dispatchTargetFor("twitter_x")).toBe("server");
    expect(dispatchTargetFor("tiktok")).toBe("server");
  });

  /**
   * Bluesky images over 1 MB need sharp, which the worker only stubs: on CF
   * they were dropped from threads or failed the post.
   */
  it("keeps Bluesky on the API by default", () => {
    delete process.env.BLUESKY_PUBLISH_ON_CF;
    expect(dispatchTargetFor("bluesky")).toBe("server");
    process.env.BLUESKY_PUBLISH_ON_CF = "1";
    expect(dispatchTargetFor("bluesky")).toBe("cloudflare");
  });

  it("sends every other platform to the Cloudflare worker", () => {
    for (const platform of ["linkedin", "instagram", "youtube", "threads"]) {
      expect(dispatchTargetFor(platform)).toBe("cloudflare");
    }
  });

  it("honours the per-platform kill switches", () => {
    process.env.TWITTER_PUBLISH_ON_CF = "1";
    expect(dispatchTargetFor("twitter_x")).toBe("cloudflare");
    expect(dispatchTargetFor("tiktok")).toBe("server");

    process.env.TIKTOK_PUBLISH_ON_CF = "1";
    expect(dispatchTargetFor("tiktok")).toBe("cloudflare");
  });
});

describe("serverPublishBaseUrl", () => {
  it("prefers the internal host and strips a trailing slash", () => {
    process.env.INTERNAL_API_BASE_URL = "http://127.0.0.1:3001/";
    process.env.AUTH_API_URL = "https://api.social0.app";
    expect(serverPublishBaseUrl()).toBe("http://127.0.0.1:3001");
  });

  it("falls back to the auth API host", () => {
    delete process.env.INTERNAL_API_BASE_URL;
    delete process.env.API_BASE_URL;
    process.env.AUTH_API_URL = "https://api.example.test";
    expect(serverPublishBaseUrl()).toBe("https://api.example.test");
  });
});

const xJob = {
  postId: "11111111-1111-4111-8111-111111111111",
  userId: "user-1",
  publicationId: "22222222-2222-4222-8222-222222222222",
  connectedAccountId: "33333333-3333-4333-8333-333333333333",
  platform: "twitter_x" as const,
};

describe("dispatchScheduledTarget", () => {
  it("posts X to /api/cron/publish-platform with the cron secret", async () => {
    delete process.env.TWITTER_PUBLISH_ON_CF;
    process.env.INTERNAL_API_BASE_URL = "http://127.0.0.1:3001";
    process.env.CRON_SECRET = "cron-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchScheduledTarget(xJob)).resolves.toBe("server");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3001/api/cron/publish-platform");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer cron-secret",
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      platform: "twitter_x",
      publicationId: xJob.publicationId,
    });
    // A hung API must not hold the scheduled scan for undici's five minutes.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("surfaces a rejected server-side dispatch instead of reporting success", async () => {
    delete process.env.TWITTER_PUBLISH_ON_CF;
    process.env.CRON_SECRET = "cron-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 401 })),
    );

    await expect(dispatchScheduledTarget(xJob)).rejects.toThrow(/401/);
  });

  it("refuses to silently drop X when CRON_SECRET is missing", async () => {
    delete process.env.TWITTER_PUBLISH_ON_CF;
    delete process.env.CRON_SECRET;
    vi.stubGlobal("fetch", vi.fn());

    await expect(dispatchScheduledTarget(xJob)).rejects.toThrow(/CRON_SECRET/);
  });

  /**
   * A missing Cloudflare secret must not be decided once for the whole scan:
   * X does not go to Cloudflare, so it has to keep publishing.
   */
  it("fails only the Cloudflare-bound platform when CF is unconfigured", async () => {
    delete process.env.CF_PUBLISH_WORKER_URL;
    delete process.env.CF_PUBLISH_HMAC_SECRET;
    process.env.CRON_SECRET = "cron-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 202 })),
    );

    await expect(
      dispatchScheduledTarget({ ...xJob, platform: "linkedin" }),
    ).rejects.toThrow(/CF publish is not configured/);
    await expect(dispatchScheduledTarget(xJob)).resolves.toBe("server");
  });
});

/**
 * A scheduled fan-out that failed part way can have no platform job left to
 * finalize it, and finalize (email, webhooks) lives on the API.
 */
describe("requestServerFinalize", () => {
  it("asks the API to finalize the post with the cron secret", async () => {
    process.env.CRON_SECRET = "cron-secret";
    process.env.INTERNAL_API_BASE_URL = "http://127.0.0.1:3001/";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await requestServerFinalize("post-1", "user-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3001/api/cron/finalize-post");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer cron-secret",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      postId: "post-1",
      userId: "user-1",
    });
    // Finalize waits on the user's webhooks; the scan stops waiting first.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("bounds the wait on a finalize that does not answer", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await requestServerFinalize("post-1", "user-1");

    expect(timeout).toHaveBeenCalledWith(SERVER_FINALIZE_TIMEOUT_MS);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(timeout.mock.results[0]?.value);
    timeout.mockRestore();
  });

  it("throws on a non-2xx response so the caller can log it", async () => {
    process.env.CRON_SECRET = "cron-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );

    await expect(requestServerFinalize("post-1", "user-1")).rejects.toThrow(
      /Finalize request failed: 500/,
    );
  });

  it("refuses without a cron secret", async () => {
    delete process.env.CRON_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestServerFinalize("post-1", "user-1")).rejects.toThrow(
      /CRON_SECRET/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
