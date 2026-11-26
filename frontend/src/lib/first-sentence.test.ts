import { describe, expect, it } from "vitest";
import { firstSentence } from "./first-sentence";

describe("firstSentence", () => {
  it("stops at the first real sentence end", () => {
    expect(firstSentence("Paste any link to check it. Then fix it.")).toBe("Paste any link to check it.");
  });
  it("ignores dots inside numbers and domains", () => {
    expect(firstSentence("Use 1200 x 630 (1.91:1) from social0.app today. More.")).toBe("Use 1200 x 630 (1.91:1) from social0.app today.");
  });
  it("returns text with no sentence end unchanged", () => {
    expect(firstSentence("No full stop")).toBe("No full stop");
  });
});
