import crypto from "crypto";

function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return key;
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
} {
  const key = encryptionKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }
  const [ivBase64, encryptedData, authTagBase64] = parts;
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");
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
  const key = encryptionKey();
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
  const derivedKeyBuffer = crypto.hkdfSync(
    "sha256",
    key,
    salt,
    `account-${accountId}`,
    32,
  );
  const derivedKey = Buffer.from(derivedKeyBuffer);
  const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
