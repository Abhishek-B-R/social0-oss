import { env } from "@/lib/env";
import crypto from "crypto";

// Simple encryption for OAuth state (userId + platform, optionally stateId for PKCE verifier lookup, oauth_token_secret for Twitter OAuth 1.0a)
// Uses AES-256-GCM for state encryption
export function encrypt(data: {
  userId: string;
  platform: string;
  codeVerifier?: string; // Legacy: kept for backwards compatibility
  stateId?: string; // New: reference to verifier stored in DB
  oauth_token_secret?: string; // Twitter OAuth 1.0a request token secret
  returnTo?: string; // Redirect path after OAuth (e.g. /dashboard/connections)
}): string {
  const key = Buffer.from(env.ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }

  const iv = crypto.randomBytes(16); // 16 byte initialization vector
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const dataString = JSON.stringify(data);
  let encrypted = cipher.update(dataString, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag(); // Verifies ciphertext wasn’t modified & prevents tampering

  // Format: iv:encrypted:authTag (all base64)
  return `${iv.toString("base64")}:${encrypted}:${authTag.toString("base64")}`; // iv : ciphertext : authTag
}

export function decrypt(encrypted: string): {
  userId: string;
  platform: string;
  codeVerifier?: string; // Legacy: kept for backwards compatibility
  stateId?: string; // New: reference to verifier stored in DB
  oauth_token_secret?: string; // Twitter OAuth 1.0a request token secret
  returnTo?: string; // Redirect path after OAuth (e.g. /dashboard/connections)
} {
  const key = Buffer.from(env.ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }

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

// Token encryption (per plan §4: AES-256-GCM, HKDF per-account salt)
// Storage format: version:salt:iv:ciphertext:authTag
export function encryptToken(token: string, accountId: string): string {
  const key = Buffer.from(env.ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }

  // Generate per-account salt (16 bytes)
  const salt = crypto.randomBytes(16);

  // Derive key using HKDF with per-account salt
  const derivedKeyBuffer = crypto.hkdfSync(
    "sha256",
    key,
    salt,
    `account-${accountId}`,
    32,
  );
  const derivedKey = Buffer.from(derivedKeyBuffer);

  // Generate IV (12 bytes for GCM)
  const iv = crypto.randomBytes(12);

  // Encrypt token
  const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv);
  let ciphertext = cipher.update(token, "utf8", "base64");
  ciphertext += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  // Storage format: version:salt:iv:ciphertext:authTag
  // Version 1 for now
  const version = "1";
  return `${version}:${salt.toString("base64")}:${iv.toString("base64")}:${ciphertext}:${authTag.toString("base64")}`;
}

export function decryptToken(
  encryptedToken: string,
  accountId: string,
): string {
  const key = Buffer.from(env.ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }

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

  // Derive key using HKDF with per-account salt
  const derivedKeyBuffer = crypto.hkdfSync(
    "sha256",
    key,
    salt,
    `account-${accountId}`,
    32,
  );
  const derivedKey = Buffer.from(derivedKeyBuffer);

  // Decrypt token
  const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
