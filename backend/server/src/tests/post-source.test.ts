import { describe, expect, it } from "vitest";

function stubServerEnv() {
  process.env.NODE_ENV ??= "test";
  process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/social0_test";
  process.env.BETTER_AUTH_URL ??= "https://api.social0.app";
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret-32chars-min!!";
  process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
  process.env.NEXT_PUBLIC_APP_URL ??= "https://social0.app";
  process.env.UPSTASH_REDIS_REST_URL ??= "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN ??= "test-upstash-token";
  process.env.ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.RESEND_API_KEY ??= "re_test";
  process.env.RESEND_FROM_EMAIL ??= "test@social0.app";
}

stubServerEnv();

const {
  carryPostSource,
  readStoredPostSource,
  toPostSourceDto,
  withPostSource,
} = await import("../lib/post-source.js");

describe("withPostSource", () => {
  it("stamps source and keeps every other key", () => {
    const out = withPostSource(
      { tiktok: { a: 1 }, source: { kind: "mcp", client: "Forged" } },
      { kind: "user" },
    );
    expect(out).toEqual({ tiktok: { a: 1 }, source: { kind: "user" } });
  });

  it("works on empty metadata", () => {
    expect(withPostSource(null, { kind: "user" })).toEqual({
      source: { kind: "user" },
    });
  });
});

describe("carryPostSource", () => {
  it("keeps the stored source and drops a client-supplied one", () => {
    const existing = {
      source: { kind: "mcp", client: "ChatGPT" },
      x: { premium: true },
    };
    expect(
      carryPostSource({ x: { premium: false }, source: { kind: "user" } }, existing),
    ).toEqual({ x: { premium: false }, source: { kind: "mcp", client: "ChatGPT" } });
  });

  it("returns null when nothing is left", () => {
    expect(carryPostSource({ source: { kind: "user" } }, null)).toBeNull();
    expect(carryPostSource(null, {})).toBeNull();
  });
});

describe("readStoredPostSource", () => {
  it("parses each kind and rejects junk", () => {
    expect(readStoredPostSource({ source: { kind: "user" } })).toEqual({ kind: "user" });
    expect(
      readStoredPostSource({
        source: { kind: "api_key", keyId: "k1", keyName: "Zapier", via: "cli" },
      }),
    ).toEqual({ kind: "api_key", keyId: "k1", keyName: "Zapier", via: "cli" });
    expect(
      readStoredPostSource({ source: { kind: "mcp", client: "Claude\n\u0000" } }),
    ).toEqual({ kind: "mcp", client: "Claude" });
    expect(readStoredPostSource({ source: { kind: "nope" } })).toBeNull();
    expect(readStoredPostSource({ source: "user" })).toBeNull();
    expect(readStoredPostSource(null)).toBeNull();
  });
});

describe("toPostSourceDto", () => {
  const names = new Map<string, string | null>([
    ["owner", "Owner Name"],
    ["mate", "Teammate Name"],
  ]);

  it("labels the signed-in creator as the current user", () => {
    const dto = toPostSourceDto(
      { metadata: { source: { kind: "user" } }, createdByUserId: "owner", ownerUserId: "owner" },
      { actorUserId: "owner", userNames: names },
    );
    expect(dto).toMatchObject({ kind: "user", isCurrentUser: true, userName: "Owner Name" });
  });

  it("names a teammate", () => {
    const dto = toPostSourceDto(
      { metadata: null, createdByUserId: "mate", ownerUserId: "owner" },
      { actorUserId: "owner", userNames: names },
    );
    expect(dto).toMatchObject({ kind: "user", isCurrentUser: false, userName: "Teammate Name" });
  });

  it("falls back to the owner on rows from before stamping", () => {
    const dto = toPostSourceDto(
      { metadata: { tiktok: {} }, createdByUserId: null, ownerUserId: "owner" },
      { actorUserId: "owner", userNames: names },
    );
    expect(dto).toMatchObject({ kind: "user", userId: "owner", isCurrentUser: true });
  });

  it("exposes key and client for API and MCP posts", () => {
    expect(
      toPostSourceDto(
        {
          metadata: { source: { kind: "api_key", keyId: "k1", keyName: "Laptop", via: "cli" } },
          ownerUserId: "owner",
        },
        { actorUserId: "owner", userNames: names },
      ),
    ).toMatchObject({ kind: "api_key", keyId: "k1", keyName: "Laptop", client: "cli" });
    expect(
      toPostSourceDto(
        { metadata: { source: { kind: "mcp", client: "ChatGPT" } }, ownerUserId: "owner" },
        { actorUserId: "owner", userNames: names },
      ),
    ).toMatchObject({ kind: "mcp", client: "ChatGPT", isCurrentUser: false });
  });
});

describe("readStoredPostSource label cleaning", () => {
  it("turns each run of control characters into one space and trims", async () => {
    const { readStoredPostSource } = await import("../lib/post-source.js");
    const source = readStoredPostSource({
      source: { kind: "api_key", keyId: "k", keyName: "\u0007Deploy\n\r\tbot\u007f\u0000key  " },
    });
    expect(source).toMatchObject({ keyName: "Deploy bot key" });
  });

  it("falls back when only control characters remain", async () => {
    const { readStoredPostSource } = await import("../lib/post-source.js");
    expect(readStoredPostSource({ source: { kind: "api_key", keyName: "\n\t" } })).toMatchObject({
      keyName: "API key",
    });
  });
});
