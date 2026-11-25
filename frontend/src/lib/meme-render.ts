export type MemeStyle = "bar" | "impact" | "sub";
export type MemeOptions = { style: MemeStyle; theme: "white" | "black"; size: number; caption: string; watermark: boolean };
type Measure = (text: string) => number;

export const MEME_FONTS_URL = "https://fonts.googleapis.com/css2?family=Anton&family=Nunito:wght@900&display=swap";
const CAPTION_FONT = (px: number) => `900 ${px}px Nunito, "Arial Rounded MT Bold", sans-serif`;
const IMPACT_FONT = (px: number) => `${px}px Anton, Impact, "Arial Black", sans-serif`;

/** Greedy word wrap; keeps the author's line breaks. */
export function wrapLines(text: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

/** Height of the caption bar for `lines` at font size `fs` (0 when there is no caption). */
export function barHeight(lineCount: number, fs: number): number {
  return lineCount ? Math.round(lineCount * fs * 1.18 + fs * 1.3) : 0;
}

/** Split "Top text. Bottom text" (or a line break) into the classic two meme lines. */
export function topBottom(caption: string): [string, string] {
  const parts = caption.trim().split(/\n+|(?<=[.!?])\s+/);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

/** Output canvas size for media `mw x mh` drawn `width` wide. */
export function memeSize(o: MemeOptions, mw: number, mh: number, width: number, measure: Measure) {
  const fs = Math.round((width / 15.5) * (o.size / 100));
  const mediaH = Math.round((width * mh) / mw);
  const lines = o.style === "bar" ? wrapLines(o.caption, width - fs * 1.6, measure) : [];
  const bar = o.style === "bar" ? barHeight(lines.length, fs) : 0;
  // Canvas dimensions must be even for H.264.
  return { width, height: (bar + mediaH) & ~1, fs, bar, mediaH, lines };
}

/** Draw one frame. `src` is a video, image or canvas already sized `mw x mh`. */
export function drawMeme(g: CanvasRenderingContext2D, src: CanvasImageSource, mw: number, mh: number, o: MemeOptions) {
  const W = g.canvas.width;
  g.font = CAPTION_FONT(Math.round((W / 15.5) * (o.size / 100)));
  const L = memeSize(o, mw, mh, W, (t) => g.measureText(t).width);
  const H = g.canvas.height;
  const dark = o.theme === "black";
  g.fillStyle = dark ? "#111" : "#fff";
  g.fillRect(0, 0, W, H);
  g.drawImage(src, 0, L.bar, W, L.mediaH);
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const fs = L.fs;

  if (o.style === "bar") {
    g.fillStyle = dark ? "#fff" : "#111";
    g.font = CAPTION_FONT(fs);
    L.lines.forEach((l, i) => g.fillText(l, W / 2, fs * 0.65 + fs * 0.95 + i * fs * 1.18));
  } else if (o.style === "impact") {
    const big = Math.round(fs * 1.25);
    g.font = IMPACT_FONT(big);
    g.lineJoin = "round";
    g.lineWidth = big / 7;
    g.strokeStyle = "#000";
    g.fillStyle = "#fff";
    const [top, bottom] = topBottom(o.caption);
    const m = (t: string) => g.measureText(t).width;
    const outline = (l: string, y: number) => {
      g.strokeText(l, W / 2, y);
      g.fillText(l, W / 2, y);
    };
    wrapLines(top.toUpperCase(), W * 0.92, m).forEach((l, i) => outline(l, big * 1.15 + i * big * 1.05));
    const bl = wrapLines(bottom.toUpperCase(), W * 0.92, m);
    bl.forEach((l, i) => outline(l, H - big * 0.35 - (bl.length - 1 - i) * big * 1.05));
  } else {
    const sf = Math.round(fs * 0.8);
    g.font = CAPTION_FONT(sf);
    const ls = wrapLines(o.caption, W * 0.86, (t) => g.measureText(t).width);
    ls.forEach((l, i) => {
      const y = H - sf * 1.4 - (ls.length - 1 - i) * sf * 1.3;
      const w = g.measureText(l).width;
      g.fillStyle = "rgba(0,0,0,.72)";
      g.fillRect(W / 2 - w / 2 - sf * 0.35, y - sf * 0.95, w + sf * 0.7, sf * 1.25);
      g.fillStyle = "#fff";
      g.fillText(l, W / 2, y);
    });
  }

  if (o.watermark) {
    const px = Math.max(12, Math.round(W / 42));
    g.font = `600 ${px}px "DM Sans", sans-serif`;
    const text = "made with social0.app";
    const bw = g.measureText(text).width + px * 1.3;
    const bh = px * 1.7;
    const x = W - bw - px * 0.8;
    const y = H - bh - px * 0.8;
    g.fillStyle = "rgba(0,0,0,.6)";
    g.beginPath();
    g.roundRect(x, y, bw, bh, bh / 2);
    g.fill();
    g.fillStyle = "#fff";
    g.textAlign = "left";
    g.fillText(text, x + px * 0.65, y + bh * 0.68);
  }
}
