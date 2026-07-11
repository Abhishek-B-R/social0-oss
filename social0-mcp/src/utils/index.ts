import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { guessMimeType } from "./logger.js";

export { guessMimeType, isUuid, sleep, formatToolError, logVerbose } from "./logger.js";

export async function readLocalFile(filePath: string): Promise<{
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  const mimeType = guessMimeType(filePath);
  if (!mimeType) {
    throw new Error(
      `Unsupported file type for "${basename(filePath)}". Supported: jpg, png, gif, webp, mp4, mov, webm`,
    );
  }

  const buffer = await readFile(filePath);
  return {
    buffer,
    filename: basename(filePath),
    mimeType,
    size: buffer.byteLength,
  };
}

export function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}
