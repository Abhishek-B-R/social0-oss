import { describe, expect, it } from "vitest";
import {
  isReservedPostMetadataKey,
  sanitizePostMetadata,
} from "../lib/post-metadata-sanitize.js";

/**
 * The background worker gives up on a scheduled post an hour after its first
 * failed dispatch, and keeps that time in `posts.metadata`. A client that
 * could write it (or echo a stale one back from an edit) would move the window:
 * an old value fails the post on its next blip.
 */
describe("dispatch failure mark", () => {
  it("is server-owned", () => {
    expect(isReservedPostMetadataKey("_dispatchFirstFailedAt")).toBe(true);
  });

  it("is stripped from client metadata", () => {
    expect(
      sanitizePostMetadata({
        _dispatchFirstFailedAt: "2020-01-01T00:00:00.000Z",
        tiktok: { privacy: "PUBLIC" },
      }),
    ).toEqual({ tiktok: { privacy: "PUBLIC" } });
  });
});
