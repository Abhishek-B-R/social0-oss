import { describe, it, expect, vi, beforeEach } from "vitest";
import { Social0ApiError } from "../src/api/client.js";
import { formatApiError } from "../src/utils/errors.js";

describe("error formatting", () => {
  it("formats API errors with hints", () => {
    const err = new Social0ApiError("Invalid API key", 401, {
      error: { code: "invalid_api_key", message: "Invalid API key" },
    });
    const formatted = formatApiError(err);
    expect(formatted).toContain("Invalid API key");
    expect(formatted).toContain("social0 login");
  });

  it("formats connection errors", () => {
    const formatted = formatApiError(new Error("fetch failed"));
    expect(formatted).toContain("Unable to connect");
    expect(formatted).toContain("social0 doctor");
  });
});

describe("API client", () => {
  it("creates Social0ApiError with code", () => {
    const err = new Social0ApiError("Rate limited", 429, {
      error: { code: "rate_limit_exceeded", message: "Too many requests" },
    });
    expect(err.status).toBe(429);
    expect(err.code).toBe("rate_limit_exceeded");
    expect(err.name).toBe("Social0ApiError");
  });
});
