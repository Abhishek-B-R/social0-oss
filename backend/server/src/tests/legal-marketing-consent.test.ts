import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock("../db/index.js", () => ({ db: mockDb }));

import { LEGAL_VERSIONS } from "@social0/shared";
import {
  MARKETING_WITHDRAWN_VERSION,
  getLegalStatus,
  recordLegalAcceptances,
} from "../lib/legal.js";

type Row = { version: string; acceptedAt: Date };

/**
 * `legal_acceptances` is append-only and read newest-first per document type.
 * The fake keeps one "latest row" per type and serves it to every select.
 */
function mockLatestByType(latest: Partial<Record<string, Row>>) {
  const order: string[] = [];
  mockDb.select.mockImplementation(() => {
    const limit = vi.fn().mockImplementation(async () => {
      // getLegalStatus reads terms, privacy, marketing in that order;
      // recordLegalAcceptances reads marketing only.
      const type = order.shift() ?? "marketing";
      const row = latest[type];
      return row ? [row] : [];
    });
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    return { from };
  });
  return {
    expectReads(types: string[]) {
      order.splice(0, order.length, ...types);
    },
  };
}

function captureInserts() {
  const inserted: Record<string, unknown>[] = [];
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockImplementation(async (rows: Record<string, unknown>[]) => {
      inserted.push(...rows);
    }),
  });
  return inserted;
}

describe("marketing consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records an opt-in row when the user opts in", async () => {
    mockLatestByType({});
    const inserted = captureInserts();

    await recordLegalAcceptances({
      userId: "u1",
      acceptTerms: true,
      acceptPrivacy: true,
      marketingOptIn: true,
    });

    expect(
      inserted.filter((r) => r.documentType === "marketing"),
    ).toEqual([
      expect.objectContaining({ version: LEGAL_VERSIONS.marketing }),
    ]);
  });

  /**
   * Unchecking the marketing box used to write nothing at all, so the earlier
   * opt-in stayed the newest row and consent could never be withdrawn.
   */
  it("supersedes a live opt-in with a withdrawal row when the user opts out", async () => {
    mockLatestByType({
      marketing: {
        version: LEGAL_VERSIONS.marketing,
        acceptedAt: new Date("2026-01-01"),
      },
    });
    const inserted = captureInserts();

    await recordLegalAcceptances({
      userId: "u1",
      acceptTerms: true,
      acceptPrivacy: true,
      marketingOptIn: false,
    });

    expect(
      inserted.filter((r) => r.documentType === "marketing"),
    ).toEqual([
      expect.objectContaining({ version: MARKETING_WITHDRAWN_VERSION }),
    ]);
  });

  it("writes no marketing row when there was never any consent", async () => {
    mockLatestByType({});
    const inserted = captureInserts();

    await recordLegalAcceptances({
      userId: "u1",
      acceptTerms: true,
      acceptPrivacy: true,
      marketingOptIn: false,
    });

    expect(inserted.filter((r) => r.documentType === "marketing")).toEqual([]);
  });

  it("reports a withdrawal as opted out", async () => {
    const helper = mockLatestByType({
      terms: { version: LEGAL_VERSIONS.terms, acceptedAt: new Date() },
      privacy: { version: LEGAL_VERSIONS.privacy, acceptedAt: new Date() },
      marketing: {
        version: MARKETING_WITHDRAWN_VERSION,
        acceptedAt: new Date(),
      },
    });
    helper.expectReads(["terms", "privacy", "marketing"]);

    const status = await getLegalStatus("u1");
    expect(status.marketingOptIn).toBe(false);
    expect(status.needsAcceptance).toBe(false);
  });

  it("reports a current opt-in as opted in", async () => {
    const helper = mockLatestByType({
      terms: { version: LEGAL_VERSIONS.terms, acceptedAt: new Date() },
      privacy: { version: LEGAL_VERSIONS.privacy, acceptedAt: new Date() },
      marketing: {
        version: LEGAL_VERSIONS.marketing,
        acceptedAt: new Date(),
      },
    });
    helper.expectReads(["terms", "privacy", "marketing"]);

    const status = await getLegalStatus("u1");
    expect(status.marketingOptIn).toBe(true);
  });
});
