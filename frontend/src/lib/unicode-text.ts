/**
 * LinkedIn/X have no rich text, so "bold" is done with Unicode math letters
 * (𝗕𝗼𝗹𝗱) and combining marks (u̲n̲d̲e̲r̲). `toPlain` undoes all of them.
 */
export type TextStyle = "bold" | "italic" | "boldItalic" | "mono" | "underline" | "strike";

// [upper A, lower a, digit 0 | null] code points, sans-serif variants (what LinkedIn posts use).
const ALPHABETS: Record<"bold" | "italic" | "boldItalic" | "mono", [number, number, number | null]> = {
  bold: [0x1d5d4, 0x1d5ee, 0x1d7ec],
  italic: [0x1d608, 0x1d622, null],
  boldItalic: [0x1d63c, 0x1d656, null],
  mono: [0x1d670, 0x1d68a, 0x1d7f6],
};
const MARKS: Record<"underline" | "strike", string> = { underline: "̲", strike: "̶" };

export function toPlain(text: string): string {
  return text.replace(/[̶̲]/g, "").replace(/[\u{1D400}-\u{1D7FF}]/gu, (c) => c.normalize("NFKC"));
}

export function applyStyle(text: string, style: TextStyle): string {
  const plain = toPlain(text);
  if (style === "underline" || style === "strike") {
    return [...plain].map((c) => (/\s/.test(c) ? c : c + MARKS[style])).join("");
  }
  const [upper, lower, digit] = ALPHABETS[style];
  return [...plain]
    .map((c) => {
      const cp = c.codePointAt(0)!;
      if (cp >= 65 && cp <= 90) return String.fromCodePoint(upper + cp - 65);
      if (cp >= 97 && cp <= 122) return String.fromCodePoint(lower + cp - 97);
      if (digit !== null && cp >= 48 && cp <= 57) return String.fromCodePoint(digit + cp - 48);
      return c;
    })
    .join("");
}

/** Apply a style, or remove it when the text already has exactly that style. */
export function toggleStyle(text: string, style: TextStyle): string {
  const styled = applyStyle(text, style);
  return styled === text ? toPlain(text) : styled;
}

/** Prefix every non-empty line with a bullet or a number. */
export function listify(text: string, kind: "bullet" | "number"): string {
  let n = 0;
  return text
    .split("\n")
    .map((line) => {
      const bare = line.replace(/^\s*(?:•|\d+\.)\s+/, "");
      if (!bare.trim()) return line;
      n += 1;
      return kind === "bullet" ? `• ${bare}` : `${n}. ${bare}`;
    })
    .join("\n");
}
