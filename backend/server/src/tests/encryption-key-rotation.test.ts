/**
 * ENCRYPTION_KEY can be rotated: new writes use the current key, and
 * ciphertexts written with a key listed in ENCRYPTION_KEYS_PREVIOUS still
 * decrypt. Before, every decrypt used the one env key, so changing it made
 * every stored platform token unreadable.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, decryptToken, encrypt, encryptToken } from "@social0/shared";

const OLD = "1".repeat(64);
const NEW = "2".repeat(64);
const OTHER = "3".repeat(64);

let saved: { key?: string; previous?: string };

beforeEach(() => {
  saved = { key: process.env.ENCRYPTION_KEY, previous: process.env.ENCRYPTION_KEYS_PREVIOUS };
  delete process.env.ENCRYPTION_KEYS_PREVIOUS;
});
afterEach(() => {
  process.env.ENCRYPTION_KEY = saved.key;
  if (saved.previous === undefined) delete process.env.ENCRYPTION_KEYS_PREVIOUS;
  else process.env.ENCRYPTION_KEYS_PREVIOUS = saved.previous;
});

function withOldKey<T>(fn: () => T): T {
  process.env.ENCRYPTION_KEY = OLD;
  return fn();
}

describe("encryption key rotation", () => {
  it("decrypts a token written with the previous key after rotating", () => {
    const stored = withOldKey(() => encryptToken("platform-token", "acc-1"));

    process.env.ENCRYPTION_KEY = NEW;
    process.env.ENCRYPTION_KEYS_PREVIOUS = OLD;

    expect(decryptToken(stored, "acc-1")).toBe("platform-token");
  });

  it("encrypts new writes with the current key only", () => {
    process.env.ENCRYPTION_KEY = NEW;
    process.env.ENCRYPTION_KEYS_PREVIOUS = OLD;
    const fresh = encryptToken("platform-token", "acc-1");

    // Readable with the new key alone: it was not written with the old one.
    delete process.env.ENCRYPTION_KEYS_PREVIOUS;
    expect(decryptToken(fresh, "acc-1")).toBe("platform-token");
  });

  it("still refuses a ciphertext no configured key wrote", () => {
    const stored = withOldKey(() => encryptToken("platform-token", "acc-1"));

    process.env.ENCRYPTION_KEY = NEW;
    process.env.ENCRYPTION_KEYS_PREVIOUS = OTHER;

    expect(() => decryptToken(stored, "acc-1")).toThrow();
  });

  it("keeps binding a token to its account under rotation", () => {
    const stored = withOldKey(() => encryptToken("platform-token", "acc-1"));
    process.env.ENCRYPTION_KEY = NEW;
    process.env.ENCRYPTION_KEYS_PREVIOUS = OLD;

    expect(() => decryptToken(stored, "acc-2")).toThrow();
  });

  it("rotates OAuth state the same way", () => {
    const state = withOldKey(() => encrypt({ userId: "u1", platform: "linkedin" }));
    process.env.ENCRYPTION_KEY = NEW;
    process.env.ENCRYPTION_KEYS_PREVIOUS = `${OTHER}, ${OLD}`;

    expect(decrypt(state)).toMatchObject({ userId: "u1", platform: "linkedin" });
  });

  it("lets a typo in a previous key fail only the reads that need it", () => {
    const old = withOldKey(() => encryptToken("old-token", "acc-1"));
    process.env.ENCRYPTION_KEY = NEW;
    process.env.ENCRYPTION_KEYS_PREVIOUS = "not-hex";
    const fresh = encryptToken("new-token", "acc-1");

    expect(decryptToken(fresh, "acc-1")).toBe("new-token");
    expect(() => decryptToken(old, "acc-1")).toThrow(/ENCRYPTION_KEYS_PREVIOUS\[0\]/);
  });
});
