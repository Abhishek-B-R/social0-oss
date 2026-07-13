import { randomBytes } from "node:crypto";
import { describe, it, expect } from "vitest";
import { redactUrlForLog } from "../src/utils/verbose.js";
import { credentialCrypto } from "../src/config/credentials.js";

const { encryptWithPassphrase, decryptWithPassphrase } = credentialCrypto;

function fixturePassphrase(): string {
  return randomBytes(16).toString("hex");
}

function fixtureToken(): string {
  return `fixture_token_${randomBytes(8).toString("hex")}`;
}

describe("redactUrlForLog", () => {
  it("redacts query strings from presigned URLs", () => {
    const url =
      "https://cdn.example.com/uploads/abc.jpg?X-Amz-Signature=fixturevalue&X-Amz-Expires=3600";
    expect(redactUrlForLog(url)).toBe("https://cdn.example.com/uploads/abc.jpg?[redacted]");
  });

  it("leaves URLs without query unchanged", () => {
    expect(redactUrlForLog("https://api.social0.app/v1/accounts")).toBe(
      "https://api.social0.app/v1/accounts",
    );
  });
});

describe("passphrase credential encryption", () => {
  it("round-trips a token with user passphrase", () => {
    const token = fixtureToken();
    const pass = fixturePassphrase();
    const encrypted = encryptWithPassphrase(token, pass);
    const decrypted = decryptWithPassphrase(encrypted, pass);
    expect(decrypted).toBe(token);
  });

  it("fails with wrong passphrase", () => {
    const encrypted = encryptWithPassphrase(fixtureToken(), fixturePassphrase());
    expect(() => decryptWithPassphrase(encrypted, fixturePassphrase())).toThrow();
  });
});
