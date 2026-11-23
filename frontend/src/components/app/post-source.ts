import type { PostSourceDto } from "@/api/dashboard";

/**
 * Who created a post. The backend stamps `posts.metadata.source`:
 *   { kind: "user", userId? , userName? }
 *   { kind: "api_key", keyId?, keyName?, client?: "cli" | string }
 *   { kind: "mcp", client?: "ChatGPT" | "Claude" | … }
 * Older posts have no source → "You".
 */

export type PostSourceKind = "user" | "teammate" | "api_key" | "cli" | "mcp";

export type PostSourceInfo = {
  kind: PostSourceKind;
  /** Chip text per SPEC §2: "You", "Priya", "ChatGPT · MCP", "CLI · prod", "API · prod". */
  label: string;
  /** True for API key / CLI / MCP: drafts from these need review. */
  isAgent: boolean;
};

export type RawPostSource = {
  kind?: string | null;
  keyName?: string | null;
  keyId?: string | null;
  client?: string | null;
  userId?: string | null;
  userName?: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Pull `source` out of `post.metadata` (or accept the source object itself). */
export function readPostSource(metadataOrSource: unknown): RawPostSource | null {
  const rec = asRecord(metadataOrSource);
  if (!rec) return null;
  const nested = asRecord(rec.source);
  const src = nested ?? (typeof rec.kind === "string" ? rec : null);
  if (!src) return null;
  return {
    kind: str(src.kind),
    keyName: str(src.keyName),
    keyId: str(src.keyId),
    client: str(src.client),
    userId: str(src.userId),
    userName: str(src.userName),
  };
}

export type PostSourceOptions = {
  /** Signed-in user's id: a `user` source with another id becomes "teammate". */
  currentUserId?: string | null;
  /** Fallback creator id (e.g. `post.createdByUserId`) when source has none. */
  createdByUserId?: string | null;
  /** Display name for a teammate creator, when the caller knows it. */
  teammateName?: string | null;
};

const MCP_CLIENT_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  openai: "ChatGPT",
  claude: "Claude",
  "claude-ai": "Claude",
  "claude code": "Claude Code",
  "claude-code": "Claude Code",
  cursor: "Cursor",
};

function prettyClient(client: string | null): string | null {
  if (!client) return null;
  return MCP_CLIENT_NAMES[client.toLowerCase()] ?? client;
}

/** Resolve a post's source to a chip label. Pure; see `usePostSource` for the hook. */
export function getPostSource(
  metadataOrSource: unknown,
  opts: PostSourceOptions = {},
): PostSourceInfo {
  const src = readPostSource(metadataOrSource);
  const kind = src?.kind ?? "user";

  if (kind === "mcp") {
    const client = prettyClient(src?.client ?? null);
    return {
      kind: "mcp",
      label: client ? `${client} · MCP` : "AI agent · MCP",
      isAgent: true,
    };
  }

  if (kind === "api_key" || kind === "cli") {
    const isCli = kind === "cli" || src?.client?.toLowerCase() === "cli";
    const keyName = src?.keyName ?? "API key";
    return {
      kind: isCli ? "cli" : "api_key",
      label: `${isCli ? "CLI" : "API"} · ${keyName}`,
      isAgent: true,
    };
  }

  const creator = src?.userId ?? opts.createdByUserId ?? null;
  if (creator && opts.currentUserId && creator !== opts.currentUserId) {
    const name = src?.userName ?? opts.teammateName ?? "Teammate";
    return { kind: "teammate", label: name, isAgent: false };
  }
  return { kind: "user", label: "You", isAgent: false };
}

/**
 * True when the post came from the signed-in user ("You"). Self sources get
 * no chip; use this to hide a whole Source column or property row when
 * every visible item is the user's own.
 */
export function isSelfSource(source: PostSourceInfo | null | undefined): boolean {
  return !source || source.kind === "user";
}

/**
 * Chip info from the server's resolved `source` (Home, Posts, Calendar
 * payloads). Falls back to `metadata.source` when the DTO is missing.
 */
export function getPostSourceFromDto(
  dto: PostSourceDto | null | undefined,
  metadata?: unknown,
): PostSourceInfo {
  if (!dto) return getPostSource(metadata ?? null);
  if (dto.kind === "user") {
    return dto.isCurrentUser
      ? { kind: "user", label: "You", isAgent: false }
      : { kind: "teammate", label: dto.userName?.trim() || "Teammate", isAgent: false };
  }
  return getPostSource({
    kind: dto.kind,
    client: dto.client,
    keyName: dto.keyName,
    keyId: dto.keyId,
  });
}
