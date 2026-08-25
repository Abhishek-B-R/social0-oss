import { describe, expect, it } from "vitest";
import {
  firstTikTokPublicVideoId,
  isTikTokVideoId,
  parseTikTokJson,
} from "../lib/tiktok-post-id.js";

describe("parseTikTokJson", () => {
  it("keeps 19-digit video ids as strings (no precision loss)", () => {
    const raw = '{"data":{"publicaly_available_post_id":[7123456789012345678]}}';
    const parsed = parseTikTokJson(raw) as {
      data: { publicaly_available_post_id: unknown[] };
    };
    const id = firstTikTokPublicVideoId(
      parsed.data.publicaly_available_post_id,
    );
    expect(id).toBe("7123456789012345678");
    expect(isTikTokVideoId(id)).toBe(true);
  });

  it("still parses normal short numbers", () => {
    const parsed = parseTikTokJson('{"data":{"status":"PUBLISH_COMPLETE","n":42}}') as {
      data: { status: string; n: number };
    };
    expect(parsed.data.status).toBe("PUBLISH_COMPLETE");
    expect(parsed.data.n).toBe(42);
  });

  it("rejects unsafe JS numbers that already lost precision", () => {
    // Simulates what JSON.parse alone would produce for a 19-digit id.
    expect(firstTikTokPublicVideoId(7.123456789012346e18)).toBeNull();
  });
});
