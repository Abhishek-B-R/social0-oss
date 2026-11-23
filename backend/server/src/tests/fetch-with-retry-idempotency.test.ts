import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../lib/publish-platforms/helpers.js";

/**
 * A POST that dies with ECONNRESET may already have reached the platform: only
 * the response was lost. Retrying it publishes the post a second time, so a
 * create is retried only when the connection provably never opened.
 */
function networkError(code: string): Error {
  return Object.assign(new TypeError("fetch failed"), { cause: { code } });
}

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not retry a POST whose connection was reset mid-request", async () => {
    const fetchMock = vi.fn(async () => {
      throw networkError("ECONNRESET");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://graph.facebook.com/v21.0/1/feed", { method: "POST" }, { delayMs: 0 }),
    ).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a POST that failed with an unclassified network error", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://graph.facebook.com/v21.0/1/feed", { method: "POST" }, { delayMs: 0 }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a POST when the connection was refused before any byte was sent", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(networkError("ECONNREFUSED"))
      .mockResolvedValueOnce(Response.json({ id: "1_2" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry(
      "https://graph.facebook.com/v21.0/1/feed",
      { method: "POST" },
      { delayMs: 0 },
    );
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a GET on a reset connection", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(networkError("ECONNRESET"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://graph.facebook.com/v21.0/1", {}, { delayMs: 0 });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries an HTTP error response", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://graph.facebook.com/v21.0/1", {}, { delayMs: 0 });
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
