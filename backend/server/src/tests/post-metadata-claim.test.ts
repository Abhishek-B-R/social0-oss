/**
 * The one-shot claim SQL on `posts.metadata`.
 *
 * These assert the *rendered statement*, not behavior through a mock, because
 * the bug they pin was invisible to a mocked db: `jsonb_build_object($1, $2)`
 * is variadic "any", so Postgres cannot infer a bare bind parameter's type and
 * rejects the whole statement with 42P18. Every unit test around the publish
 * webhook and the failure email passed while neither claim could execute at
 * all against a real server.
 */

import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  claimMetadataKeySql,
  releaseMetadataKeySql,
} from "../lib/post-metadata-claim.js";

const dialect = new PgDialect();
const render = (fragment: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  dialect.sqlToQuery(fragment);

describe("claimMetadataKeySql", () => {
  it("casts both jsonb_build_object arguments so Postgres can type them", () => {
    const { sql: text } = render(
      claimMetadataKeySql("_publishWebhookSentAt", "2026-09-06T23:00:00.000Z"),
    );
    // Postgres raises 42P18 without these casts.
    expect(text).toContain("jsonb_build_object($1::text, $2::text)");
    expect(text).not.toMatch(/jsonb_build_object\(\$\d+,/);
  });

  it("merges onto the existing metadata rather than replacing it", () => {
    const { sql: text, params } = render(
      claimMetadataKeySql("_failureEmailSentAt", "2026-09-06T23:00:00.000Z"),
    );
    expect(text).toContain("coalesce");
    expect(text).toContain("'{}'::jsonb");
    expect(text).toContain("||");
    expect(params).toEqual([
      "_failureEmailSentAt",
      "2026-09-06T23:00:00.000Z",
    ]);
  });
});

describe("releaseMetadataKeySql", () => {
  it("casts the key so `jsonb - text` is unambiguous", () => {
    const { sql: text, params } = render(
      releaseMetadataKeySql("_publishWebhookSentAt"),
    );
    // jsonb has both `- text` and `- integer`; the cast picks the key form.
    expect(text).toContain("- $1::text");
    expect(params).toEqual(["_publishWebhookSentAt"]);
  });
});
