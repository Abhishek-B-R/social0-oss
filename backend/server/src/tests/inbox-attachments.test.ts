import { describe, expect, it } from "vitest";
import {
  extractMediaFromText,
  parseBskyViewEmbed,
  parseFbCommentAttachment,
  parseGraphAttachments,
  withMediaFallback,
  xMediaToAttachment,
} from "../lib/inbox/parse-attachment.js";

describe("parseGraphAttachments", () => {
  it("reads image_data.url", () => {
    expect(
      parseGraphAttachments({
        data: [{ mime_type: "image/jpeg", image_data: { url: "https://scontent.xx.fbcdn.net/a.jpg" } }],
      }),
    ).toEqual({ type: "image", url: "https://scontent.xx.fbcdn.net/a.jpg" });
  });

  it("reads video_data + payload + file_url", () => {
    expect(
      parseGraphAttachments([
        { type: "video", video_data: { url: "https://video.xx.fbcdn.net/a.mp4", preview_url: "https://scontent.xx.fbcdn.net/p.jpg" } },
      ]),
    ).toEqual({
      type: "video",
      url: "https://video.xx.fbcdn.net/a.mp4",
      thumbnailUrl: "https://scontent.xx.fbcdn.net/p.jpg",
    });
    expect(
      parseGraphAttachments({ data: [{ payload: { url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1" } }] }),
    ).toEqual({
      type: "image",
      url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1",
    });
    expect(parseGraphAttachments({ data: [{ file_url: "https://cdninstagram.com/x.webp" }] })).toEqual({
      type: "image",
      url: "https://cdninstagram.com/x.webp",
    });
  });
});

describe("extractMediaFromText", () => {
  it("promotes a CDN URL in the message body", () => {
    const found = extractMediaFromText("check https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=9 please");
    expect(found).toEqual({
      type: "image",
      url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=9",
    });
    expect(withMediaFallback("see https://example.com/post/1", null).attachment).toBeNull();
    expect(withMediaFallback("photo https://pbs.twimg.com/media/abc.jpg done", null)).toEqual({
      text: "photo done",
      attachment: { type: "image", url: "https://pbs.twimg.com/media/abc.jpg" },
    });
  });
});

describe("xMediaToAttachment", () => {
  it("picks the highest-bitrate mp4 variant for videos", () => {
    expect(
      xMediaToAttachment({
        type: "video",
        preview_image_url: "https://pbs.twimg.com/t.jpg",
        variants: [
          { content_type: "application/x-mpegURL", url: "https://video.twimg.com/a.m3u8" },
          { content_type: "video/mp4", url: "https://video.twimg.com/lo.mp4", bit_rate: 256000 },
          { content_type: "video/mp4", url: "https://video.twimg.com/hi.mp4", bit_rate: 832000 },
        ],
      }),
    ).toEqual({
      type: "video",
      url: "https://video.twimg.com/hi.mp4",
      thumbnailUrl: "https://pbs.twimg.com/t.jpg",
    });
  });
});

describe("parseBskyViewEmbed / parseFbCommentAttachment", () => {
  it("reads bluesky images and facebook comment photos", () => {
    expect(
      parseBskyViewEmbed({
        $type: "app.bsky.embed.images#view",
        images: [{ fullsize: "https://cdn.bsky.app/img/feed_fullsize/plain/x", thumb: "https://cdn.bsky.app/img/feed_thumbnail/plain/x" }],
      }),
    ).toEqual({ type: "image", url: "https://cdn.bsky.app/img/feed_fullsize/plain/x" });
    expect(
      parseFbCommentAttachment({
        type: "photo",
        media: { image: { src: "https://scontent.xx.fbcdn.net/c.jpg" } },
      }),
    ).toEqual({ type: "image", url: "https://scontent.xx.fbcdn.net/c.jpg" });
  });
});
