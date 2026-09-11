import { describe, it, expect } from "vitest";
import { sanitizeReturnToPath } from "@social0/shared";

describe("sanitizeReturnToPath", () => {
  it("keeps ordinary in-app paths", () => {
    expect(sanitizeReturnToPath("/dashboard")).toBe("/dashboard");
    expect(sanitizeReturnToPath("/dashboard/teams/abc/inbox?x=1")).toBe(
      "/dashboard/teams/abc/inbox?x=1",
    );
    expect(sanitizeReturnToPath("  /onboarding  ")).toBe("/onboarding");
  });

  it("rejects absolute and protocol-relative targets", () => {
    expect(sanitizeReturnToPath("https://evil.com")).toBeNull();
    expect(sanitizeReturnToPath("//evil.com")).toBeNull();
    expect(sanitizeReturnToPath("/\\evil.com")).toBeNull();
    expect(sanitizeReturnToPath("dashboard")).toBeNull();
    expect(sanitizeReturnToPath(undefined)).toBeNull();
  });

  /**
   * `new URL()` strips tab/CR/LF from its input, so these used to survive the
   * guard and then resolve to a foreign origin.
   */
  it("rejects embedded control characters that the URL parser strips", () => {
    for (const raw of [
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/da\tshboard",
      "/dashboard\u0000",
      "/dashboard\u007f",
    ]) {
      expect(sanitizeReturnToPath(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("never resolves to a foreign origin", () => {
    for (const raw of ["/\t/evil.com", "/\r\n/evil.com", "//evil.com"]) {
      const safe = sanitizeReturnToPath(raw);
      const resolved = new URL(safe ?? "/dashboard", "https://social0.app/");
      expect(resolved.origin).toBe("https://social0.app");
    }
  });
});
