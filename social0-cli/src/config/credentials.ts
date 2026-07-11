import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { hostname, userInfo } from "node:os";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ensureConfigDir, getConfigDir } from "./settings.js";

const SERVICE_NAME = "social0-cli";
const ACCOUNT_NAME = "api-key";
const FALLBACK_FILE = "credentials.enc";

function deriveKey(): Buffer {
  const salt = `social0-cli:${hostname()}:${userInfo().username}`;
  return scryptSync(salt, "social0-cli-v1", 32);
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(ciphertext: string): string {
  const key = deriveKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 16);
  const tag = buf.subarray(16, 32);
  const data = buf.subarray(32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

async function tryKeytar(): Promise<typeof import("keytar") | null> {
  try {
    return await import("keytar");
  } catch {
    return null;
  }
}

export async function storeApiKey(apiKey: string): Promise<void> {
  ensureConfigDir();
  const keytar = await tryKeytar();
  if (keytar) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, apiKey);
    // Remove fallback if keytar works
    const fallbackPath = join(getConfigDir(), FALLBACK_FILE);
    if (existsSync(fallbackPath)) unlinkSync(fallbackPath);
    return;
  }
  const fallbackPath = join(getConfigDir(), FALLBACK_FILE);
  writeFileSync(fallbackPath, encrypt(apiKey), { mode: 0o600 });
}

export async function getApiKey(): Promise<string | null> {
  const env = process.env.SOCIAL0_API_KEY;
  if (env) return env;

  const keytar = await tryKeytar();
  if (keytar) {
    const key = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (key) return key;
  }

  const fallbackPath = join(getConfigDir(), FALLBACK_FILE);
  if (existsSync(fallbackPath)) {
    try {
      return decrypt(readFileSync(fallbackPath, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

export async function deleteApiKey(): Promise<void> {
  const keytar = await tryKeytar();
  if (keytar) {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  }
  const fallbackPath = join(getConfigDir(), FALLBACK_FILE);
  if (existsSync(fallbackPath)) unlinkSync(fallbackPath);
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null;
}
