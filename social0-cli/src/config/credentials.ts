import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { password } from "@inquirer/prompts";
import { ensureConfigDir, getConfigDir } from "./settings.js";

const SERVICE_NAME = "social0-cli";
const ACCOUNT_NAME = "api-key";
const FALLBACK_FILE = "credentials.enc";

// ponytail: in-process only; avoids re-prompting every command in one session
let sessionPassphrase: string | null = null;

async function tryKeytar(): Promise<typeof import("keytar") | null> {
  try {
    return await import("keytar");
  } catch {
    return null;
  }
}

function deriveKeyFromPassphrase(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32);
}

function encryptWithPassphrase(plaintext: string, passphrase: string): string {
  const salt = randomBytes(16);
  const key = deriveKeyFromPassphrase(passphrase, salt);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
}

function decryptWithPassphrase(ciphertext: string, passphrase: string): string {
  const buf = Buffer.from(ciphertext, "base64");
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 32);
  const tag = buf.subarray(32, 48);
  const data = buf.subarray(48);
  const key = deriveKeyFromPassphrase(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

async function resolvePassphrase(confirm = false): Promise<string> {
  const env = process.env.SOCIAL0_CREDENTIAL_PASSPHRASE;
  if (env) return env;
  if (sessionPassphrase) return sessionPassphrase;

  const pass = await password({
    message: confirm
      ? "Create a local encryption passphrase (required without OS keychain):"
      : "Enter your credential encryption passphrase:",
    mask: "•",
    validate: (v) => (v.length >= 8 ? true : "Passphrase must be at least 8 characters"),
  });

  if (confirm) {
    const confirmPass = await password({
      message: "Confirm passphrase:",
      mask: "•",
      validate: (v) => (v === pass ? true : "Passphrases do not match"),
    });
    sessionPassphrase = confirmPass;
    return confirmPass;
  }

  sessionPassphrase = pass;
  return pass;
}

function fallbackPath(): string {
  return join(getConfigDir(), FALLBACK_FILE);
}

function removeFallbackFile(): void {
  const path = fallbackPath();
  if (existsSync(path)) unlinkSync(path);
}

export async function storeApiKey(apiKey: string): Promise<void> {
  ensureConfigDir();
  const keytar = await tryKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, apiKey);
      removeFallbackFile();
      return;
    } catch {
      // fall through to passphrase-encrypted file
    }
  }

  const passphrase = await resolvePassphrase(true);
  writeFileSync(fallbackPath(), encryptWithPassphrase(apiKey, passphrase), { mode: 0o600 });
}

export async function getApiKey(): Promise<string | null> {
  const env = process.env.SOCIAL0_API_KEY;
  if (env) return env;

  const keytar = await tryKeytar();
  if (keytar) {
    try {
      const key = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (key) return key;
    } catch {
      // fall through
    }
  }

  const path = fallbackPath();
  if (!existsSync(path)) return null;

  try {
    const passphrase = await resolvePassphrase();
    return decryptWithPassphrase(readFileSync(path, "utf8"), passphrase);
  } catch {
    removeFallbackFile();
    return null;
  }
}

export async function deleteApiKey(): Promise<void> {
  sessionPassphrase = null;
  const keytar = await tryKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    } catch {
      // ignore
    }
  }
  removeFallbackFile();
}

export async function hasApiKey(): Promise<boolean> {
  if (process.env.SOCIAL0_API_KEY) return true;

  const keytar = await tryKeytar();
  if (keytar) {
    try {
      if (await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)) return true;
    } catch {
      // fall through
    }
  }

  return existsSync(fallbackPath());
}

/** @internal — exposed for unit tests only */
export const credentialCrypto = { encryptWithPassphrase, decryptWithPassphrase };
