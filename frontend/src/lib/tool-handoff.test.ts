import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasPendingHandoff, loadToolDraft, saveHandoff, saveToolDraft, setToolStore, takeHandoff } from "./tool-handoff";

const mem = new Map<string, unknown>();
const ls = new Map<string, string>();

beforeEach(() => {
  mem.clear();
  ls.clear();
  setToolStore({
    get: async (k) => mem.get(k),
    set: async (k, v) => void mem.set(k, v),
    del: async (k) => void mem.delete(k),
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  });
  vi.stubGlobal("window", { setTimeout: (f: () => void) => f() });
});

describe("handoff", () => {
  it("is taken once and clears the pending flag", async () => {
    await saveHandoff({ text: "hi", from: "test" }, 1000);
    expect(hasPendingHandoff(2000)).toBe(true);
    expect((await takeHandoff(2000))?.text).toBe("hi");
    expect(hasPendingHandoff(3000)).toBe(false);
    expect(await takeHandoff(3000)).toBeNull();
  });
  it("expires after a day", async () => {
    await saveHandoff({ text: "old", from: "test" }, 0);
    const day = 24 * 60 * 60 * 1000;
    expect(hasPendingHandoff(day + 1)).toBe(false);
    expect(await takeHandoff(day + 1)).toBeNull();
  });
});

describe("drafts", () => {
  it("round-trip and expire after a week", async () => {
    await saveToolDraft("meme", { caption: "x" }, 0);
    expect(await loadToolDraft("meme", 1000)).toEqual({ caption: "x" });
    expect(await loadToolDraft("meme", 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
