import { fitRect } from "@/lib/content/image-resizer";

export type ImageSource = { img: CanvasImageSource; w: number; h: number; name: string };

/** A placeholder picture so image tools show real output before anyone uploads. */
export function sampleSource(w = 1600, h = 1067): ImageSource {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#10b981");
  grad.addColorStop(1, "#0ea5e9");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,.92)";
  g.textAlign = "center";
  g.font = `bold ${Math.round(h / 10)}px system-ui, sans-serif`;
  g.fillText("Your image here", w / 2, h / 2);
  g.font = `${Math.round(h / 19)}px system-ui, sans-serif`;
  g.fillText(`sample ${w} x ${h}`, w / 2, h / 2 + h / 10);
  return { img: c, w, h, name: "sample" };
}

/** Load a user's file as an image source; rejects with a readable message. */
export function loadImageFile(file: File): Promise<ImageSource> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("That file isn't an image. Use a JPG, PNG, WebP or GIF."));
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ img, w: img.naturalWidth, h: img.naturalHeight, name: file.name });
    img.onerror = () => reject(new Error("This image couldn't be opened. Try saving it as JPG or PNG first."));
    img.src = URL.createObjectURL(file);
  });
}

/** Draw `src` into a `dw x dh` canvas (cover or contain), optionally only the `crop` window of that layout. */
export function renderTo(
  canvas: HTMLCanvasElement,
  src: ImageSource,
  layout: { w: number; h: number },
  mode: "cover" | "contain",
  bg: string,
  crop: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: layout.w, h: layout.h },
  scale = 1,
) {
  canvas.width = Math.round(crop.w * scale);
  canvas.height = Math.round(crop.h * scale);
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.fillStyle = bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const r = fitRect(src.w, src.h, layout.w, layout.h, mode);
  g.drawImage(src.img, (r.x - crop.x) * scale, (r.y - crop.y) * scale, r.w * scale, r.h * scale);
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string, type: "image/jpeg" | "image/png" = "image/jpeg") {
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    type,
    0.92,
  );
}

export const baseName = (name: string) => name.replace(/\.[^.]+$/, "");
