import { describe, expect, it } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  isApiKeyFormat,
  KEY_PREFIX,
  safeCompareApiKey,
} from "../lib/api-keys.js";

describe("api-keys", () => {
  it("generates sk_live_ prefixed keys", () => {
    const { raw, hash, prefix } = generateApiKey();
    expect(raw.startsWith(KEY_PREFIX)).toBe(true);
    expect(prefix.startsWith(KEY_PREFIX)).toBe(true);
    expect(hash).toHaveLength(64);
    expect(hashApiKey(raw)).toBe(hash);
  });

  it("recognizes legacy and new key formats", () => {
    expect(isApiKeyFormat("sk_live_abc")).toBe(true);
    expect(isApiKeyFormat("s0_live_abc")).toBe(true);
    expect(isApiKeyFormat("pk_test_abc")).toBe(false);
  });

  it("safeCompareApiKey uses constant-time compare", () => {
    const a = "abc";
    const b = "abc";
    const c = "abd";
    expect(safeCompareApiKey(a, b)).toBe(true);
    expect(safeCompareApiKey(a, c)).toBe(false);
  });
});

describe("api-errors", () => {
  it("formats standardized error shape", async () => {
    const { apiError } = await import("../lib/api-errors.js");
    expect(apiError("invalid_api_key", "API key is invalid.")).toEqual({
      error: { code: "invalid_api_key", message: "API key is invalid." },
    });
  });
});

describe("api-rate-limits", () => {
  it("assigns tier limits", async () => {
    const { apiRequestsPerHour } = await import("../lib/api-rate-limits.js");
    expect(apiRequestsPerHour("free")).toBe(60);
    expect(apiRequestsPerHour("growth")).toBe(1000);
    expect(apiRequestsPerHour("pro")).toBe(5000);
  });
});
