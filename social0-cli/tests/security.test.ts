import { describe, it, expect } from "vitest";
import { redactUrlForLog } from "../src/utils/verbose.js";
import { credentialCrypto } from "../src/config/credentials.js";

const { encryptWithPassphrase, decryptWithPassphrase } = credentialCrypto;

describe("redactUrlForLog", () => {
  it("redacts query strings from presigned URLs", () => {
    const url =
      "https://cdn.example.com/uploads/abc.jpg?X-Amz-Signature=secret&X-Amz-Expires=3600";
    expect(redactUrlForLog(url)).toBe("https://cdn.example.com/uploads/abc.jpg?[redacted]");
  });

  it("leaves URLs without query unchanged", () => {
    expect(redactUrlForLog("https://api.social0.app/v1/accounts")).toBe(
      "https://api.social0.app/v1/accounts",
    );
  });
});

// Re-export test helpers from credentials module internals via a thin test util
describe("passphrase credential encryption", () => {
  it("round-trips API key with user passphrase", () => {
    const encrypted = encryptWithPassphrase("sk_live_test_key_123", "my-secure-passphrase");
    const decrypted = decryptWithPassphrase(encrypted, "my-secure-passphrase");
    expect(decrypted).toBe("sk_live_test_key_123");
  });

  it("fails with wrong passphrase", () => {
    const encrypted = encryptWithPassphrase("sk_live_test_key_123", "correct-pass");
    expect(() => decryptWithPassphrase(encrypted, "wrong-pass")).toThrow();
  });
});
