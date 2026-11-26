import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import Link from "@/components/AppLink";
import { ToolHero } from "@/components/landing/ToolHero";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { absoluteUrl } from "@/lib/seo";
import { databullGoal } from "@/lib/databull";
import { baseName, canvasToFile, downloadCanvas, sampleSource } from "@/lib/canvas-image";
import { postEverywhere } from "@/lib/tool-handoff";
import { useToolDraft } from "@/lib/use-tool-draft";
import {
  DOC_WIDTH, EDITOR_FONTS_URL, FONTS, PAD, docHeight, dragLayer, drawDoc, fontCss, hitTest, layerRect, onHandle,
  type Base, type Doc, type ImageLayer, type Layer, type TextLayer,
} from "@/lib/meme-editor";
import { FREE_TOOLS_PATH } from "@/lib/content/free-tools";
import { MEME_IMAGE as T, MEME_VIDEO, freeToolPath } from "@/lib/content/free-tools-standalone";
import { cn } from "@/lib/utils";

const btn = "inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] font-semibold hover:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background";
const field = "rounded-lg border border-border bg-background px-2.5 py-1.5 text-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50";

let nextId = 1;
const newText = (text: string, y: number): TextLayer => ({
  id: nextId++, type: "text", text, x: DOC_WIDTH / 2, y, size: 76, width: DOC_WIDTH - 80, font: "Anton",
  color: "#ffffff", stroke: "#000000", strokeWidth: 7, caps: true, align: "center", box: false,
});

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Use an image (JPG, PNG, WebP or GIF)."));
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This image couldn't be opened. Try a JPG or PNG."));
    img.src = URL.createObjectURL(file);
  });
}

export default function MemeEditorPage() {
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const sample = useMemo<Base | null>(() => {
    if (typeof document === "undefined") return null;
    const s = sampleSource(1200, 900);
    return { el: s.img, w: s.w, h: s.h };
  }, []);
  const navigate = useNavigate();
  const [base, setBase] = useState<Base | null>(null);
  const [baseFile, setBaseFileState] = useState<Blob | null>(null);
  const [baseName_, setBaseName] = useState("social0");
  const [padTop, setPadTop] = useState(0);
  const [padBottom, setPadBottom] = useState(0);
  const [layers, setLayers] = useState<Layer[]>(() => [newText("When the free tool", 90), newText("Is better than the paid one", 720)]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: "move" | "resize"; id: number; x: number; y: number; start: Layer } | null>(null);
  const [fontsReady, setFontsReady] = useState(0);

  const doc: Doc | null = useMemo(() => {
    const b = base ?? sample;
    return b ? { base: b, padTop, padBottom, layers } : null;
  }, [base, sample, padTop, padBottom, layers]);

  useEffect(() => {
    if (!document.querySelector(`link[href="${EDITOR_FONTS_URL}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = EDITOR_FONTS_URL;
      document.head.appendChild(l);
    }
    void Promise.all(FONTS.map(([f]) => document.fonts?.load(`700 40px "${f}"`))).then(() => setFontsReady((n) => n + 1));
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !doc) return;
    c.width = DOC_WIDTH;
    c.height = docHeight(doc);
    drawDoc(c.getContext("2d")!, doc, { selected, watermark: !signedIn });
  }, [doc, selected, signedIn, fontsReady]);

  const measureFor = (l: Layer) => {
    const g = canvas.current!.getContext("2d")!;
    if (l.type === "text") g.font = fontCss(l);
    return (s: string) => g.measureText(s).width;
  };
  const toModel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * e.currentTarget.width) / r.width, y: ((e.clientY - r.top) * e.currentTarget.height) / r.height };
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = toModel(e);
    const sel = layers.find((l) => l.id === selected);
    if (sel && onHandle(layerRect(sel, measureFor(sel)), p.x, p.y)) {
      drag.current = { mode: "resize", id: sel.id, x: p.x, y: p.y, start: sel };
    } else {
      const hit = [...layers].reverse().find((l) => hitTest([l], p.x, p.y, measureFor(l)));
      setSelected(hit?.id ?? null);
      if (hit) drag.current = { mode: "move", id: hit.id, x: p.x, y: p.y, start: hit };
    }
    if (drag.current) e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toModel(e);
    const moved = dragLayer(d.start, d.mode, p.x - d.x, p.y - d.y);
    setLayers((ls) => ls.map((l) => (l.id === d.id ? moved : l)));
  };
  const onUp = () => {
    drag.current = null;
  };

  const update = (id: number, patch: Partial<TextLayer>) =>
    setLayers((ls) => ls.map((l) => (l.id === id && l.type === "text" ? { ...l, ...patch } : l)));
  const remove = (id: number) => {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    setSelected(null);
  };
  const duplicate = (id: number) => {
    const l = layers.find((x) => x.id === id);
    if (!l) return;
    const copy = { ...l, id: nextId++, x: l.x + 40, y: l.y + 40 };
    setLayers((ls) => [...ls, copy]);
    setSelected(copy.id);
  };
  const toFront = (id: number) => setLayers((ls) => [...ls.filter((l) => l.id !== id), ...ls.filter((l) => l.id === id)]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected == null || !["Delete", "Backspace"].includes(e.key)) return;
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement | null)?.tagName ?? "")) return;
      setLayers((ls) => ls.filter((l) => l.id !== selected));
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const setBaseFile = (file?: File) =>
    file &&
    loadImage(file).then(
      (img) => {
        setBase({ el: img, w: img.naturalWidth, h: img.naturalHeight });
        setBaseFileState(file);
        setBaseName(baseName(file.name));
        setError("");
      },
      (e: Error) => setError(e.message),
    );
  const addImageFile = (file?: File) =>
    file &&
    loadImage(file).then(
      (img) => {
        const w = DOC_WIDTH / 3;
        const layer: Layer = { id: nextId++, type: "image", el: img, file, x: DOC_WIDTH / 3, y: 200, w, h: (w * img.naturalHeight) / img.naturalWidth };
        setLayers((ls) => [...ls, layer]);
        setSelected(layer.id);
        setError("");
      },
      (e: Error) => setError(e.message),
    );
  // Remember the meme (base file, white space, layers with their files) across sign-in.
  type Saved = { baseFile: Blob | null; name: string; padTop: number; padBottom: number; layers: (TextLayer | (Omit<ImageLayer, "el"> & { file?: Blob }))[] };
  const draft = useMemo<Saved>(
    () => ({ baseFile, name: baseName_, padTop, padBottom, layers: layers.map((l) => (l.type === "image" ? { ...l, el: undefined } : l)) }),
    [baseFile, baseName_, padTop, padBottom, layers],
  );
  useToolDraft<Saved>("meme-editor", draft, (d) => {
    void (async () => {
      const restored: Layer[] = [];
      for (const l of d.layers) {
        if (l.type === "text") restored.push(l);
        else if (l.file) restored.push({ ...l, el: await loadImage(l.file) });
      }
      nextId = Math.max(nextId, ...restored.map((l) => l.id + 1));
      if (d.baseFile) {
        const img = await loadImage(d.baseFile);
        setBase({ el: img, w: img.naturalWidth, h: img.naturalHeight });
        setBaseFileState(d.baseFile);
      }
      setBaseName(d.name);
      setPadTop(d.padTop);
      setPadBottom(d.padBottom);
      setLayers(restored);
    })().catch(() => undefined);
  });

  const togglePad = (which: "top" | "bottom") => {
    if (which === "top") {
      const next = padTop ? 0 : PAD;
      setLayers((ls) => ls.map((l) => ({ ...l, y: l.y + (next - padTop) })));
      setPadTop(next);
    } else setPadBottom(padBottom ? 0 : PAD);
  };

  const download = (type: "image/jpeg" | "image/png") => {
    if (!doc) return;
    const c = document.createElement("canvas");
    c.width = DOC_WIDTH;
    c.height = docHeight(doc);
    drawDoc(c.getContext("2d")!, doc, { selected: null, watermark: !signedIn });
    downloadCanvas(c, `${baseName_}-meme.${type === "image/png" ? "png" : "jpg"}`, type);
    databullGoal("free_tool_download", { tool: T.slug });
  };

  /** Render the meme and open it in the composer (through sign-in if needed). */
  const post = async () => {
    databullGoal("free_tool_cta", { tool: T.slug });
    let files: File[] | undefined;
    if (doc && (baseFile || layers.some((l) => l.type === "image"))) {
      const c = document.createElement("canvas");
      c.width = DOC_WIDTH;
      c.height = docHeight(doc);
      drawDoc(c.getContext("2d")!, doc, { selected: null, watermark: !signedIn });
      files = [await canvasToFile(c, `${baseName_}-meme.jpg`)];
    }
    await postEverywhere({ files, from: T.slug }, signedIn, navigate, signInUrl);
  };

  const sel = layers.find((l) => l.id === selected);
  const texts = layers.filter((l): l is TextLayer => l.type === "text");
  const path = freeToolPath(T.slug);

  return (
    <MarketingPageLayout signedIn={signedIn}>
      <SeoHead title={T.metaTitle} description={T.metaDescription} path={path} canonical={absoluteUrl(path)}
        keywords={["meme generator", "meme maker", "add text to image", "meme editor"]} />
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <nav className="text-[12px] text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Social0</Link> ›{" "}
          <Link href={FREE_TOOLS_PATH} className="hover:underline">Free tools</Link> › {T.name}
        </nav>

        <ToolHero title={T.name} intro={T.intro} local />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
          <div className="flex min-w-0 flex-col items-center gap-2 rounded-2xl bg-muted/60 p-3 sm:p-4 lg:sticky lg:top-20">
            <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              onDoubleClick={() => selected != null && document.getElementById(`meme-text-${selected}`)?.focus()}
              className="h-auto max-h-[80vh] w-auto max-w-full touch-none rounded shadow-lg" aria-label="Meme canvas. Drag text and images to move them." />
            <p className="text-[12px] text-muted-foreground">Drag to move · drag the blue corner to resize · double-click text to edit · Delete removes</p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap gap-2">
              <label className={btn}>
                {base ? "Change image" : "Upload image"}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => void setBaseFile(e.target.files?.[0])} />
              </label>
              <button type="button" className={btn} onClick={() => { const t = newText("New text", docHeight(doc!) / 2); setLayers((ls) => [...ls, t]); setSelected(t.id); }}>+ Text</button>
              <label className={btn}>
                + Image
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => void addImageFile(e.target.files?.[0])} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-muted-foreground">White space</span>
              <button type="button" className={btn} aria-pressed={padTop > 0} onClick={() => togglePad("top")}>Top</button>
              <button type="button" className={btn} aria-pressed={padBottom > 0} onClick={() => togglePad("bottom")}>Bottom</button>
            </div>
            {error ? <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{error}</p> : null}

            {texts.map((t, i) => (
              <div key={t.id} className={cn("flex flex-col gap-2 rounded-xl border bg-background p-2.5", t.id === selected ? "border-sky-500" : "border-border")}>
                <div className="flex items-center gap-1.5">
                  <input id={`meme-text-${t.id}`} value={t.text} placeholder={`Text #${i + 1}`} onFocus={() => setSelected(t.id)}
                    onChange={(e) => update(t.id, { text: e.target.value })} className={cn(field, "min-w-0 flex-1")} aria-label={`Text ${i + 1}`} />
                  <input type="color" value={t.color} onChange={(e) => update(t.id, { color: e.target.value })} className="h-8 w-9 cursor-pointer rounded border border-border bg-transparent" aria-label="Text colour" title="Text colour" />
                  <input type="color" value={t.stroke} onChange={(e) => update(t.id, { stroke: e.target.value })} className="h-8 w-9 cursor-pointer rounded border border-border bg-transparent" aria-label="Outline colour" title="Outline colour" />
                  <button type="button" className={btn} aria-pressed={t.id === selected} onClick={() => setSelected(t.id === selected ? null : t.id)} aria-label="More settings" title="More settings">⚙</button>
                </div>
                {t.id === selected ? (
                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[13px]">
                    <span className="text-muted-foreground">Font</span>
                    <select value={t.font} onChange={(e) => update(t.id, { font: e.target.value })} className={field}>
                      {FONTS.map(([f, label]) => <option key={f} value={f}>{label}</option>)}
                    </select>
                    <span className="text-muted-foreground">Size</span>
                    <input type="range" min={14} max={200} value={t.size} onChange={(e) => update(t.id, { size: Number(e.target.value) })} className="accent-emerald-500" aria-label="Text size" />
                    <span className="text-muted-foreground">Outline</span>
                    <input type="range" min={0} max={20} value={t.strokeWidth} onChange={(e) => update(t.id, { strokeWidth: Number(e.target.value) })} className="accent-emerald-500" aria-label="Outline thickness" />
                    <span className="text-muted-foreground">Style</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className={btn} aria-pressed={t.caps} onClick={() => update(t.id, { caps: !t.caps })}>ALL CAPS</button>
                      <button type="button" className={btn} aria-pressed={t.box} onClick={() => update(t.id, { box: !t.box })}>Box</button>
                      {(["left", "center", "right"] as const).map((a) => (
                        <button key={a} type="button" className={btn} aria-pressed={t.align === a} onClick={() => update(t.id, { align: a })}>{a[0].toUpperCase() + a.slice(1)}</button>
                      ))}
                    </div>
                    <span />
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className={btn} onClick={() => duplicate(t.id)}>Duplicate</button>
                      <button type="button" className={btn} onClick={() => toFront(t.id)}>To front</button>
                      <button type="button" className={btn} onClick={() => remove(t.id)}>Delete</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {sel?.type === "image" ? (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-sky-500 bg-background p-2.5 text-[13px]">
                <b className="mr-1">Image</b>
                <button type="button" className={btn} onClick={() => duplicate(sel.id)}>Duplicate</button>
                <button type="button" className={btn} onClick={() => toFront(sel.id)}>To front</button>
                <button type="button" className={btn} onClick={() => remove(sel.id)}>Delete</button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" onClick={() => download("image/jpeg")}
                className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2.5 text-[14px] font-bold text-emerald-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2">
                Download JPG
              </button>
              <button type="button" className={btn} onClick={() => download("image/png")}>PNG</button>
              <button type="button" onClick={() => void post()} className={btn}>Post it everywhere →</button>
            </div>
            <p className="text-[12px] text-muted-foreground">
              {signedIn ? "You're signed in, so downloads have no badge." : (
                <>Free downloads carry a small “made with social0.app” badge. <Link href={signInUrl(path)} className="underline">Sign up free</Link> to remove it.</>
              )}
            </p>
          </div>
        </div>

        <section className="grid gap-8 md:grid-cols-3">
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">How to use it</h2>
            <ol className="list-decimal space-y-1 pl-5 text-[14px] text-muted-foreground">{T.howTo.map((h) => <li key={h}>{h}</li>)}</ol>
          </div>
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">Good to know</h2>
            <ul className="list-disc space-y-1 pl-5 text-[14px] text-muted-foreground">{T.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">More free tools</h2>
            <div className="flex flex-wrap gap-2">
              {[[freeToolPath(MEME_VIDEO.slug), "Meme video maker"], ["/free-tools/image-resizer", "Image resizer"], ["/free-tools/instagram-grid-maker", "Instagram grid maker"]].map(([href, label]) => (
                <Link key={href} href={href} className="rounded-full border border-border px-3 py-1 text-[13px] hover:border-foreground/40">{label}</Link>
              ))}
              <Link href={FREE_TOOLS_PATH} className="rounded-full border border-border px-3 py-1 text-[13px] hover:border-foreground/40">All free tools</Link>
            </div>
          </div>
        </section>

        <section className="max-w-[760px]">
          <h2 className="mb-3 font-serif text-[24px] font-bold">FAQ</h2>
          <div className="flex flex-col divide-y divide-border">
            {T.faq.map((f) => (
              <details key={f.question} className="py-3">
                <summary className="cursor-pointer text-[15px] font-semibold">{f.question}</summary>
                <p className="mt-2 text-[14px] text-muted-foreground">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </MarketingPageLayout>
  );
}
