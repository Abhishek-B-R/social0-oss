import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, updates } = vi.hoisted(() => {
  const updates: { table: unknown; values: Record<string, unknown> }[] = [];
  return {
    updates,
    mockDb: {
      update: vi.fn((table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            updates.push({ table, values });
          },
        }),
      })),
    },
  };
});

vi.mock("../db/index.js", () => ({ db: mockDb }));

import { postPublications, posts } from "../db/schema.js";
import {
  PUBLICATION_HEARTBEAT_MS,
  renewPublicationLease,
  startPublicationHeartbeat,
} from "../lib/publication-lease.js";
import { STUCK_PUBLISHING_MS } from "../lib/stuck-publishing.js";

beforeEach(() => {
  updates.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("publication lease", () => {
  it("beats several times inside one stuck window", () => {
    expect(PUBLICATION_HEARTBEAT_MS * 4).toBeLessThanOrEqual(STUCK_PUBLISHING_MS);
  });

  it("renews the deliveries and the post", async () => {
    await renewPublicationLease("post-1", ["pub-1", "pub-2"]);
    expect(updates.map((u) => u.table)).toEqual([postPublications, posts]);
    expect(updates.every((u) => u.values.updatedAt instanceof Date)).toBe(true);
  });

  it("does nothing without deliveries", async () => {
    await renewPublicationLease("post-1", []);
    expect(updates).toHaveLength(0);
  });

  it("keeps renewing while a slow upload runs and stops when told", async () => {
    const stop = startPublicationHeartbeat("post-1", ["pub-1"], 1000);

    await vi.advanceTimersByTimeAsync(3500);
    const during = updates.filter((u) => u.table === postPublications).length;
    expect(during).toBe(3);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(updates.filter((u) => u.table === postPublications).length).toBe(during);
  });

  it("survives a failed beat and keeps going", async () => {
    mockDb.update.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const stop = startPublicationHeartbeat("post-1", ["pub-1"], 1000);

    await vi.advanceTimersByTimeAsync(2500);
    stop();
    expect(updates.filter((u) => u.table === postPublications).length).toBe(1);
  });
});
