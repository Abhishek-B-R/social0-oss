import { readFileSync } from "node:fs";
import { extname, basename } from "node:path";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export function guessMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").trim()));
    process.stdin.on("error", reject);
  });
}

export function parseMarkdownFrontMatter(content: string): {
  content: string;
  platforms?: string[];
  schedule?: string;
  media?: string[];
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { content: content.trim() };

  const frontMatter = match[1];
  const body = match[2].trim();
  const result: ReturnType<typeof parseMarkdownFrontMatter> = { content: body };

  const platformsMatch = frontMatter.match(/platforms:\s*\n((?:\s*-\s*.+\n?)+)/);
  if (platformsMatch) {
    result.platforms = platformsMatch[1]
      .split("\n")
      .map((l) => l.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean);
  }

  const scheduleMatch = frontMatter.match(/schedule:\s*(.+)/);
  if (scheduleMatch) result.schedule = scheduleMatch[1].trim();

  const mediaMatch = frontMatter.match(/media:\s*\n((?:\s*-\s*.+\n?)+)/);
  if (mediaMatch) {
    result.media = mediaMatch[1]
      .split("\n")
      .map((l) => l.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean);
  }

  return result;
}

export function readFileContent(path: string): string {
  return readFileSync(path, "utf8");
}

export function getFilename(path: string): string {
  return basename(path);
}
