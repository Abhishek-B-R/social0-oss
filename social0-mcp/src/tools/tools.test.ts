import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOOL_DEFINITIONS } from "./definitions.js";
import {
  getAnalyticsOverviewInputSchema,
  getInboxDmThreadInputSchema,
  getPostAnalyticsInputSchema,
  listInboxCommentsInputSchema,
  listInboxDmsInputSchema,
  moderateCommentInputSchema,
  replyToCommentInputSchema,
  replyToDmInputSchema,
} from "../schemas/tools.js";

const ANALYTICS_INBOX_TOOLS = [
  "get_analytics",
  "get_post_analytics",
  "list_inbox_comments",
  "reply_to_comment",
  "moderate_comment",
  "list_inbox_dms",
  "get_inbox_dm_thread",
  "reply_to_dm",
];

describe("analytics + inbox tool definitions", () => {
  it("advertises every analytics and inbox tool", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    for (const name of ANALYTICS_INBOX_TOOLS) {
      assert.ok(names.includes(name), `${name} missing from tools/list`);
    }
  });

  it("gives every tool a description a model can route on", () => {
    for (const tool of TOOL_DEFINITIONS) {
      assert.ok(
        (tool.description ?? "").length > 40,
        `${tool.name} needs a usable description`,
      );
      assert.equal(tool.inputSchema.type, "object");
    }
  });

  it("has no duplicate tool names", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    assert.equal(new Set(names).size, names.length);
  });
});

describe("analytics + inbox input schemas", () => {
  it("defaults get_analytics to no explicit window", () => {
    const parsed = getAnalyticsOverviewInputSchema.parse({});
    assert.equal(parsed.range, undefined);
  });

  it("rejects an unknown range", () => {
    assert.equal(getAnalyticsOverviewInputSchema.safeParse({ range: "3y" }).success, false);
  });

  it("requires a uuid post id", () => {
    assert.equal(getPostAnalyticsInputSchema.safeParse({ post_id: "nope" }).success, false);
    assert.equal(
      getPostAnalyticsInputSchema.safeParse({
        post_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      }).success,
      true,
    );
  });

  it("caps the inbox page size at the server limit", () => {
    assert.equal(listInboxCommentsInputSchema.safeParse({ limit: 25 }).success, false);
    assert.equal(listInboxCommentsInputSchema.safeParse({ limit: 24 }).success, true);
    assert.equal(listInboxDmsInputSchema.safeParse({ limit: 0 }).success, false);
  });

  it("requires publication_id alongside comment_id on mutations", () => {
    assert.equal(
      replyToCommentInputSchema.safeParse({ comment_id: "c1", text: "hi" }).success,
      false,
    );
    assert.equal(
      replyToCommentInputSchema.safeParse({
        comment_id: "c1",
        publication_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        text: "hi",
      }).success,
      true,
    );
    assert.equal(
      moderateCommentInputSchema.safeParse({
        comment_id: "c1",
        publication_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        action: "shadowban",
      }).success,
      false,
    );
  });

  it("requires an account for DM reads and sends", () => {
    assert.equal(
      getInboxDmThreadInputSchema.safeParse({ conversation_id: "c" }).success,
      false,
    );
    assert.equal(
      replyToDmInputSchema.safeParse({ conversation_id: "c", account: "bluesky" }).success,
      false,
    );
    assert.equal(
      replyToDmInputSchema.safeParse({
        conversation_id: "c",
        account: "bluesky",
        text: "hello",
      }).success,
      true,
    );
  });
});
