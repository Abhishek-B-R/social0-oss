import { config } from "../config.js";

export function logVerbose(message: string, data?: unknown): void {
  if (!config.verbose) return;
  const prefix = `[social0-mcp ${new Date().toISOString()}]`;
  if (data !== undefined) {
    console.error(prefix, message, JSON.stringify(data, null, 2));
  } else {
    console.error(prefix, message);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function guessMimeType(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  return ext ? (map[ext] ?? null) : null;
}

export function formatToolError(title: string, reason: string, hint?: string): string {
  const lines = [`Failed: ${title}`, "", `Reason: ${reason}`];
  if (hint) {
    lines.push("", `Hint: ${hint}`);
  }
  return lines.join("\n");
}
