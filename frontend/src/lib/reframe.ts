import { fitRect } from "@/lib/content/image-resizer";

export type ReframeMode = "blur" | "color" | "crop";
export type Rect = { x: number; y: number; w: number; h: number };
export type Target = { id: string; label: string; w: number; h: number; use: string };

/** Output sizes (720 wide keeps in-browser recording smooth; all even for H.264). */
export const TARGETS: Target[] = [
  { id: "9x16", label: "9:16 vertical", w: 720, h: 1280, use: "Reels, TikTok, Shorts, Stories" },
  { id: "4x5", label: "4:5 portrait", w: 720, h: 900, use: "Instagram and LinkedIn feed" },
  { id: "1x1", label: "1:1 square", w: 720, h: 720, use: "Feed posts everywhere" },
  { id: "16x9", label: "16:9 landscape", w: 1280, h: 720, use: "YouTube, X, LinkedIn" },
];

/**
 * Where to draw a `sw x sh` clip in a `W x H` frame.
 * blur/color: the whole clip fits (`fg`), the gaps get a blurred copy (`bg`) or a colour.
 * crop: the clip fills the frame; `pos` (0-1) picks which part stays (left→right or top→bottom).
 */
export function reframeLayout(sw: number, sh: number, W: number, H: number, mode: ReframeMode, pos = 0.5): { bg: Rect | null; fg: Rect } {
  if (mode === "crop") {
    const r = fitRect(sw, sh, W, H, "cover");
    const p = Math.min(1, Math.max(0, pos));
    return { bg: null, fg: { ...r, x: r.w > W ? (W - r.w) * p : r.x, y: r.h > H ? (H - r.h) * p : r.y } };
  }
  return { bg: mode === "blur" ? fitRect(sw, sh, W, H, "cover") : null, fg: fitRect(sw, sh, W, H, "contain") };
}

/** Draw one reframed frame. `blurBuf` is a small scratch canvas reused for the cheap blur. */
export function drawReframe(
  g: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  o: { mode: ReframeMode; pos: number; color: string },
  blurBuf: HTMLCanvasElement,
) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  const L = reframeLayout(sw, sh, W, H, o.mode, o.pos);
  g.fillStyle = o.mode === "color" ? o.color : "#000";
  g.fillRect(0, 0, W, H);
  if (L.bg) {
    // Blur by drawing tiny and scaling up: works in every browser, unlike ctx.filter.
    const bw = 32;
    const bh = Math.max(1, Math.round((bw * H) / W));
    blurBuf.width = bw;
    blurBuf.height = bh;
    const b = blurBuf.getContext("2d")!;
    b.drawImage(src, (L.bg.x * bw) / W, (L.bg.y * bh) / H, (L.bg.w * bw) / W, (L.bg.h * bh) / H);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(blurBuf, 0, 0, W, H);
    g.fillStyle = "rgba(0,0,0,.25)";
    g.fillRect(0, 0, W, H);
  }
  g.drawImage(src, L.fg.x, L.fg.y, L.fg.w, L.fg.h);
}
