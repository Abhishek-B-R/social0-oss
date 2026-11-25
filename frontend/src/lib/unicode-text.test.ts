import { describe, expect, it } from "vitest";
import { applyStyle, listify, toPlain, toggleStyle } from "./unicode-text";

describe("unicode text styles", () => {
  it("makes sans-serif bold letters and digits, leaving the rest", () => {
    expect(applyStyle("Hi 2!", "bold")).toBe("𝗛𝗶 𝟮!");
  });
  it("round-trips every style back to plain text", () => {
    for (const s of ["bold", "italic", "boldItalic", "mono", "underline", "strike"] as const) {
      expect(toPlain(applyStyle("Ship it 42", s))).toBe("Ship it 42");
    }
  });
  it("switches style instead of stacking, and toggles off", () => {
    expect(applyStyle(applyStyle("ab", "bold"), "italic")).toBe(applyStyle("ab", "italic"));
    expect(toggleStyle(applyStyle("ab", "bold"), "bold")).toBe("ab");
  });
  it("underlines letters but not spaces", () => {
    expect(applyStyle("a b", "underline")).toBe("a̲ b̲");
  });
  it("keeps non-Latin text and emoji untouched", () => {
    expect(applyStyle("é 🚀", "bold")).toBe("é 🚀");
  });
});

describe("listify", () => {
  it("bullets and numbers non-empty lines and replaces existing markers", () => {
    expect(listify("one\n\ntwo", "bullet")).toBe("• one\n\n• two");
    expect(listify("• one\n• two", "number")).toBe("1. one\n2. two");
  });
});
