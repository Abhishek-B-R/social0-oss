import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { confirm, password } from "@inquirer/prompts";
import { ensureConfigDir, getConfigDir } from "./settings.js";

const SERVICE_NAME = "social0-cli";
const ACCOUNT_NAME = "api-key";
const ENCRYPTED_FILE = "credentials.enc";
const PLAIN_FILE = "credentials";

/** How to handle passphrase when OS keychain is unavailable. */
export type PassphraseMode = "ask" | "require" | "skip";

export type CredentialStorage =
  | "env"
  | "keychain"
  | "encrypted"
  | "plaintext"
  | "none";

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

async function resolvePassphrase(confirmCreate = false): Promise<string> {
  const env = process.env.SOCIAL0_CREDENTIAL_PASSPHRASE;
  if (env) return env;
  if (sessionPassphrase) return sessionPassphrase;

  const pass = await password({
    message: confirmCreate
      ? "Create a local encryption passphrase:"
      : "Enter your credential encryption passphrase:",
    mask: "•",
    validate: (v) => (v.length >= 8 ? true : "Passphrase must be at least 8 characters"),
  });

  if (confirmCreate) {
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

function encryptedPath(): string {
  return join(getConfigDir(), ENCRYPTED_FILE);
}

function plainPath(): string {
  return join(getConfigDir(), PLAIN_FILE);
}

function removeFile(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

function writeEncrypted(apiKey: string, passphrase: string): void {
  writeFileSync(encryptedPath(), encryptWithPassphrase(apiKey, passphrase), { mode: 0o600 });
  removeFile(plainPath());
}

function writePlain(apiKey: string): void {
  writeFileSync(plainPath(), apiKey, { mode: 0o600 });
  removeFile(encryptedPath());
}

async function shouldUsePassphrase(mode: PassphraseMode): Promise<boolean> {
  if (mode === "require") return true;
  if (mode === "skip") return false;
  if (process.env.SOCIAL0_CREDENTIAL_PASSPHRASE) return true;
  // Non-interactive: skip unless env passphrase is set (handled above)
  if (!process.stdin.isTTY) return false;

  return confirm({
    message: "Protect local credentials with a passphrase? (optional)",
    default: true,
  });
}

export async function storeApiKey(
  apiKey: string,
  options: { passphrase?: PassphraseMode } = {},
): Promise<void> {
  ensureConfigDir();
  const keytar = await tryKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, apiKey);
      removeFile(encryptedPath());
      removeFile(plainPath());
      return;
    } catch {
      // fall through to local file storage
    }
  }

  const mode = options.passphrase ?? "ask";
  if (await shouldUsePassphrase(mode)) {
    const passphrase = await resolvePassphrase(true);
    writeEncrypted(apiKey, passphrase);
  } else {
    writePlain(apiKey);
  }
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

  if (existsSync(encryptedPath())) {
    try {
      const passphrase = await resolvePassphrase();
      return decryptWithPassphrase(readFileSync(encryptedPath(), "utf8"), passphrase);
    } catch {
      throw new Error(
        "Could not decrypt credentials (wrong passphrase?). Try again, or run `social0 logout` then `social0 login`.",
      );
    }
  }

  if (existsSync(plainPath())) {
    try {
      return readFileSync(plainPath(), "utf8").trim() || null;
    } catch {
      return null;
    }
  }

  return null;
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
  removeFile(encryptedPath());
  removeFile(plainPath());
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

  return existsSync(encryptedPath()) || existsSync(plainPath());
}

export async function getCredentialStorage(): Promise<CredentialStorage> {
  if (process.env.SOCIAL0_API_KEY) return "env";

  const keytar = await tryKeytar();
  if (keytar) {
    try {
      if (await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)) return "keychain";
    } catch {
      // fall through
    }
  }

  if (existsSync(encryptedPath())) return "encrypted";
  if (existsSync(plainPath())) return "plaintext";
  return "none";
}

/** Enable passphrase encryption for an existing local API key. */
export async function enablePassphrase(): Promise<"encrypted" | "keychain" | "none"> {
  const storage = await getCredentialStorage();
  if (storage === "keychain" || storage === "env") return "keychain";
  if (storage === "none") return "none";

  const apiKey = await getApiKey();
  if (!apiKey) return "none";

  const passphrase = await resolvePassphrase(true);
  writeEncrypted(apiKey, passphrase);
  sessionPassphrase = passphrase;
  return "encrypted";
}

/** Drop passphrase protection and store the API key as a local plaintext file (0600). */
export async function disablePassphrase(): Promise<"plaintext" | "keychain" | "none" | "already"> {
  const storage = await getCredentialStorage();
  if (storage === "keychain" || storage === "env") return "keychain";
  if (storage === "none") return "none";
  if (storage === "plaintext") return "already";

  const apiKey = await getApiKey();
  if (!apiKey) return "none";

  writePlain(apiKey);
  sessionPassphrase = null;
  return "plaintext";
}

/** @internal — exposed for unit tests only */
export const credentialCrypto = { encryptWithPassphrase, decryptWithPassphrase };
