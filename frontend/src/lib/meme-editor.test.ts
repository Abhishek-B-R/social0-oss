import { describe, expect, it } from "vitest";
import { dragLayer, hitTest, layerRect, onHandle, textLines, type ImageLayer, type TextLayer } from "./meme-editor";

const m = (s: string) => s.length * 10;
const text = (o: Partial<TextLayer> = {}): TextLayer => ({
  id: 1, type: "text", text: "hello world", x: 500, y: 100, size: 40, width: 400, font: "Anton",
  color: "#fff", stroke: "#000", strokeWidth: 4, caps: false, align: "center", box: false, ...o,
});
const img: ImageLayer = { id: 2, type: "image", el: {} as CanvasImageSource, x: 0, y: 0, w: 200, h: 100 };

describe("meme editor model", () => {
  it("wraps text to the box width and applies caps", () => {
    expect(textLines(text({ text: "aaaa bbbb cccc", width: 80 }), m)).toEqual(["aaaa", "bbbb", "cccc"]);
    expect(textLines(text({ caps: true }), m)).toEqual(["HELLO WORLD"]);
  });
  it("centres the text box on x, y", () => {
    const r = layerRect(text(), m);
    expect(r.x + r.w / 2).toBeCloseTo(500);
    expect(r.y + r.h / 2).toBeCloseTo(100);
  });
  it("hits the topmost layer", () => {
    expect(hitTest([img, text({ x: 100, y: 50 })], 100, 50, m)?.id).toBe(1);
    expect(hitTest([img], 150, 90, m)?.id).toBe(2);
    expect(hitTest([img], 900, 900, m)).toBeUndefined();
  });
  it("finds the resize handle at the bottom-right corner", () => {
    expect(onHandle({ x: 0, y: 0, w: 200, h: 100 }, 198, 99)).toBe(true);
    expect(onHandle({ x: 0, y: 0, w: 200, h: 100 }, 100, 50)).toBe(false);
  });
  it("moves, and resizes images keeping their shape", () => {
    expect(dragLayer(img, "move", 10, 20)).toMatchObject({ x: 10, y: 20 });
    expect(dragLayer(img, "resize", 200, 0)).toMatchObject({ w: 400, h: 200 });
    expect(dragLayer(text(), "resize", 0, 160).size).toBe(80);
  });
});
