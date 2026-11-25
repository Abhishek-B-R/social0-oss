/** imgflip-style meme editor model: a base image plus draggable text and image layers. */
export type TextLayer = {
  id: number; type: "text"; text: string; x: number; y: number; size: number; width: number;
  font: string; color: string; stroke: string; strokeWidth: number; caps: boolean;
  align: "left" | "center" | "right"; box: boolean;
};
export type ImageLayer = { id: number; type: "image"; el: CanvasImageSource; x: number; y: number; w: number; h: number };
export type Layer = TextLayer | ImageLayer;
export type Rect = { x: number; y: number; w: number; h: number };
export type Base = { el: CanvasImageSource; w: number; h: number };
export type Doc = { base: Base; padTop: number; padBottom: number; layers: Layer[] };

/** Canvas width in model units; exports at this size. */
export const DOC_WIDTH = 1080;
export const PAD = 240;
export const FONTS: [string, string][] = [
  ["Anton", "Impact (classic)"], ["Nunito", "Rounded bold"], ["Bangers", "Comic"], ["Permanent Marker", "Marker"], ["Roboto", "Clean"],
];
export const EDITOR_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Nunito:wght@900&family=Permanent+Marker&family=Roboto:wght@700&display=swap";

export const fontCss = (t: Pick<TextLayer, "font" | "size">) =>
  `${t.font === "Nunito" ? "900 " : t.font === "Roboto" ? "700 " : ""}${t.size}px "${t.font}", Impact, sans-serif`;

export function docHeight(d: Doc): number {
  return Math.round(d.padTop + (DOC_WIDTH * d.base.h) / d.base.w + d.padBottom);
}

type Measure = (s: string) => number;

export function textLines(t: TextLayer, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of (t.caps ? t.text.toUpperCase() : t.text).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > t.width) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Box around a layer (with a little padding for text), in model units. */
export function layerRect(l: Layer, measure: Measure): Rect & { lines?: string[]; lineHeight?: number } {
  if (l.type === "image") return { x: l.x, y: l.y, w: l.w, h: l.h };
  const lines = textLines(l, measure);
  const lineHeight = l.size * 1.1;
  const w = Math.min(l.width, Math.max(20, ...lines.map(measure)));
  const h = lines.length * lineHeight;
  const left = l.align === "center" ? l.x - w / 2 : l.align === "left" ? l.x - l.width / 2 : l.x + l.width / 2 - w;
  const pad = Math.max(6, l.size * 0.12);
  return { x: left - pad, y: l.y - h / 2 - pad, w: w + pad * 2, h: h + pad * 2, lines, lineHeight };
}

/** Topmost layer under a point. */
export function hitTest(layers: Layer[], x: number, y: number, measure: Measure): Layer | undefined {
  return [...layers].reverse().find((l) => {
    const r = layerRect(l, measure);
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  });
}

/** True when the point is on the resize handle of `r`. */
export const onHandle = (r: Rect, x: number, y: number, size = 34) =>
  Math.abs(x - (r.x + r.w)) <= size && Math.abs(y - (r.y + r.h)) <= size;

/** Move or resize a layer from its state when the drag started. */
export function dragLayer<L extends Layer>(start: L, mode: "move" | "resize", dx: number, dy: number): L {
  if (mode === "move") return { ...start, x: start.x + dx, y: start.y + dy };
  if (start.type === "image") {
    const k = Math.max(0.05, (start.w + dx) / start.w);
    return { ...start, w: start.w * k, h: start.h * k };
  }
  return { ...start, size: Math.max(14, Math.round(start.size * (1 + dy / 160))), width: Math.max(80, start.width + dx * 2) };
}

export function drawDoc(g: CanvasRenderingContext2D, d: Doc, o: { selected?: number | null; watermark: boolean }) {
  const W = DOC_WIDTH;
  const H = docHeight(d);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.drawImage(d.base.el, 0, d.padTop, W, (W * d.base.h) / d.base.w);
  const measure = (s: string) => g.measureText(s).width;
  for (const l of d.layers) {
    if (l.type === "image") {
      g.drawImage(l.el, l.x, l.y, l.w, l.h);
      continue;
    }
    g.font = fontCss(l);
    const r = layerRect(l, measure);
    const lines = r.lines!;
    const lh = r.lineHeight!;
    if (l.box) {
      g.fillStyle = "rgba(0,0,0,.65)";
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    g.textAlign = l.align;
    g.textBaseline = "middle";
    const ax = l.align === "center" ? l.x : l.align === "left" ? l.x - l.width / 2 : l.x + l.width / 2;
    lines.forEach((line, i) => {
      const y = l.y - ((lines.length - 1) * lh) / 2 + i * lh;
      if (l.strokeWidth > 0) {
        g.lineJoin = "round";
        g.lineWidth = l.strokeWidth;
        g.strokeStyle = l.stroke;
        g.strokeText(line, ax, y);
      }
      g.fillStyle = l.color;
      g.fillText(line, ax, y);
    });
  }
  if (o.watermark) {
    const px = 22;
    g.font = `600 ${px}px "DM Sans", sans-serif`;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    const text = "made with social0.app";
    const bw = g.measureText(text).width + px * 1.3;
    const bh = px * 1.7;
    g.fillStyle = "rgba(0,0,0,.6)";
    g.beginPath();
    g.roundRect(W - bw - 16, H - bh - 16, bw, bh, bh / 2);
    g.fill();
    g.fillStyle = "#fff";
    g.fillText(text, W - bw - 16 + px * 0.65, H - 16 - bh * 0.32);
  }
  const sel = d.layers.find((l) => l.id === o.selected);
  if (sel) {
    if (sel.type === "text") g.font = fontCss(sel);
    const r = layerRect(sel, measure);
    g.setLineDash([10, 7]);
    g.strokeStyle = "#0ea5e9";
    g.lineWidth = 3;
    g.strokeRect(r.x, r.y, r.w, r.h);
    g.setLineDash([]);
    g.fillStyle = "#0ea5e9";
    g.fillRect(r.x + r.w - 14, r.y + r.h - 14, 28, 28);
  }
}
