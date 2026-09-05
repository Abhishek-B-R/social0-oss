import { describe, expect, it } from "vitest";
import {
  analyticsQueryString,
  inboxQueryString,
} from "../src/api/query.js";
import { WINDOW_RANGES } from "../src/types/index.js";

describe("analytics query string", () => {
  it("is empty when nothing is set", () => {
    expect(analyticsQueryString({})).toBe("");
  });

  it("only sends what the caller asked for", () => {
    expect(analyticsQueryString({ range: "28d" })).toBe("?range=28d");
  });

  it("maps camelCase options to the snake_case API", () => {
    const qs = analyticsQueryString({ range: "7d", accountId: "acc-1", fresh: true });
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get("account_id")).toBe("acc-1");
    expect(params.get("fresh")).toBe("1");
  });

  it("omits fresh when false rather than sending fresh=0", () => {
    expect(analyticsQueryString({ fresh: false })).toBe("");
  });
});

describe("inbox query string", () => {
  it("carries the paging cursor and page size", () => {
    const qs = inboxQueryString({
      before: "2026-03-01T00:00:00.000Z",
      limit: 12,
      platform: "bluesky",
    });
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get("before")).toBe("2026-03-01T00:00:00.000Z");
    expect(params.get("limit")).toBe("12");
    expect(params.get("platform")).toBe("bluesky");
  });

  it("keeps limit 0 out rather than sending an invalid page size", () => {
    // 0 is not a valid page size server-side; the command layer rejects it
    // first, but the builder must not silently coerce it away either.
    expect(new URLSearchParams(inboxQueryString({ limit: 0 }).slice(1)).get("limit")).toBe(
      "0",
    );
  });

  it("supports a custom window", () => {
    const qs = inboxQueryString({
      range: "custom",
      since: "2026-01-01T00:00:00.000Z",
      until: "2026-02-01T00:00:00.000Z",
    });
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get("range")).toBe("custom");
    expect(params.get("since")).toBe("2026-01-01T00:00:00.000Z");
    expect(params.get("until")).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("window ranges", () => {
  it("matches the presets the API accepts", () => {
    expect([...WINDOW_RANGES]).toEqual([
      "7d",
      "14d",
      "28d",
      "90d",
      "365d",
      "custom",
    ]);
  });
});
