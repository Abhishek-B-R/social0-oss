import crypto from "crypto";

/** Same parsing ENCRYPTION_KEY has always had, so an existing key keeps working. */
function parseKey(raw: string, name: string): Buffer {
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(`${name} must be 64 hex characters (32 bytes)`);
  }
  return key;
}

/** The key everything is encrypted with. */
function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  return parseKey(raw, "ENCRYPTION_KEY");
}

/**
 * Keys a ciphertext may have been written with: the current one first, then
 * `ENCRYPTION_KEYS_PREVIOUS` (comma-separated, newest first).
 *
 * This is how the key is rotated: set the new key as ENCRYPTION_KEY and move
 * the old one into ENCRYPTION_KEYS_PREVIOUS (on the API and the publish
 * worker alike). New writes use the new key and old ciphertexts still read;
 * tokens move over as they are refreshed. Drop an old key once nothing is
 * written with it any more. AES-GCM authenticates each attempt, so a wrong key
 * fails cleanly instead of returning garbage.
 */
function* decryptionKeys(): Generator<Buffer> {
  yield encryptionKey();
  // Parsed only when the current key did not fit, so a typo here can fail
  // only the reads that need an old key, never every read.
  const previous = (process.env.ENCRYPTION_KEYS_PREVIOUS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  for (const [i, raw] of previous.entries()) {
    yield parseKey(raw, `ENCRYPTION_KEYS_PREVIOUS[${i}]`);
  }
}

/**
 * Try each key in turn; rethrow the current key's error if none fits. A
 * malformed previous key is a configuration error and is thrown as such.
 */
function withEachKey<T>(attempt: (key: Buffer) => T): T {
  let firstError: unknown;
  for (const key of decryptionKeys()) {
    try {
      return attempt(key);
    } catch (e) {
      firstError ??= e;
    }
  }
  throw firstError;
}

// Simple encryption for OAuth state (userId + platform, optionally stateId for PKCE verifier lookup, oauth_token_secret for Twitter OAuth 1.0a)
// Uses AES-256-GCM for state encryption
export function encrypt(data: {
  userId: string;
  platform: string;
  codeVerifier?: string;
  stateId?: string;
  oauth_token_secret?: string;
  returnTo?: string;
  reauth?: boolean;
  reauthAccountId?: string;
  workspaceId?: string | null;
}): string {
  const key = encryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const dataString = JSON.stringify(data);
  let encrypted = cipher.update(dataString, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${encrypted}:${authTag.toString("base64")}`;
}

export function decrypt(encrypted: string): {
  userId: string;
  platform: string;
  codeVerifier?: string;
  stateId?: string;
  oauth_token_secret?: string;
  returnTo?: string;
  reauth?: boolean;
  reauthAccountId?: string;
  workspaceId?: string | null;
} {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }
  const [ivBase64, encryptedData, authTagBase64] = parts;
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const decrypted = withEachKey((key) => {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encryptedData, "base64", "utf8") + decipher.final("utf8");
  });
  return JSON.parse(decrypted);
}

export function encryptToken(token: string, accountId: string): string {
  const key = encryptionKey();
  const salt = crypto.randomBytes(16);
  const derivedKeyBuffer = crypto.hkdfSync(
    "sha256",
    key,
    salt,
    `account-${accountId}`,
    32,
  );
  const derivedKey = Buffer.from(derivedKeyBuffer);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv);
  let ciphertext = cipher.update(token, "utf8", "base64");
  ciphertext += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `1:${salt.toString("base64")}:${iv.toString("base64")}:${ciphertext}:${authTag.toString("base64")}`;
}

export function decryptToken(encryptedToken: string, accountId: string): string {
  const parts = encryptedToken.split(":");
  if (parts.length !== 5) {
    throw new Error("Invalid encrypted token format");
  }
  const [version, saltBase64, ivBase64, ciphertext, authTagBase64] = parts;
  if (version !== "1") {
    throw new Error(`Unsupported encryption version: ${version}`);
  }
  const salt = Buffer.from(saltBase64, "base64");
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  return withEachKey((key) => {
    const derivedKey = Buffer.from(
      crypto.hkdfSync("sha256", key, salt, `account-${accountId}`, 32),
    );
    const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext, "base64", "utf8") + decipher.final("utf8");
  });
}
