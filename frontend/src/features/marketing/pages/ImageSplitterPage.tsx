import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { absoluteUrl } from "@/lib/seo";
import { databullGoal } from "@/lib/databull";
import { baseName, canvasToFile, downloadCanvas, loadImageFile, renderTo, sampleSource, type ImageSource } from "@/lib/canvas-image";
import { postEverywhere } from "@/lib/tool-handoff";
import { useToolDraft } from "@/lib/use-tool-draft";
import { splitTiles, type Tile } from "@/lib/split-image";
import { FREE_TOOLS_PATH } from "@/lib/content/free-tools";
import { INSTAGRAM_CAROUSEL, INSTAGRAM_GRID, freeToolPath } from "@/lib/content/free-tools-standalone";
import { IMAGE_RESIZER_PATH } from "@/lib/content/image-resizer";
import { cn } from "@/lib/utils";

type Kind = "grid" | "carousel";
type Shape = { label: string; w: number; h: number };

const SHAPES: Record<Kind, Shape[]> = {
  grid: [
    { label: "3:4 (current grid)", w: 1080, h: 1440 },
    { label: "Square", w: 1080, h: 1080 },
  ],
  carousel: [
    { label: "4:5 portrait", w: 1080, h: 1350 },
    { label: "Square", w: 1080, h: 1080 },
  ],
};
const COUNTS: Record<Kind, number[]> = { grid: [1, 2, 3, 4], carousel: [2, 3, 4, 5, 6, 7, 8, 9, 10] };

const chip = (on: boolean) =>
  cn(
    "rounded-md px-3 py-1.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
    on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
  );

function TileCanvas({ src, layout, tile, label }: { src: ImageSource; layout: { w: number; h: number }; tile: Tile; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderTo(ref.current, src, layout, "cover", "#ffffff", tile, 300 / tile.h);
  }, [src, layout, tile]);
  return <canvas ref={ref} className="block h-auto w-full" aria-label={label} />;
}

export default function ImageSplitterPage({ kind }: { kind: Kind }) {
  const T = kind === "grid" ? INSTAGRAM_GRID : INSTAGRAM_CAROUSEL;
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [src, setSrc] = useState<ImageSource | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(3);
  const [shapeIdx, setShapeIdx] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileId = useId();
  const sample = useMemo(
    () => (typeof document === "undefined" ? null : kind === "grid" ? sampleSource(1620, 1440) : sampleSource(3240, 1350)),
    [kind],
  );

  const draft = useMemo(() => (file ? { file, count, shapeIdx } : null), [file, count, shapeIdx]);
  useToolDraft<{ file: File; count: number; shapeIdx: number }>(`splitter-${kind}`, draft, (d) => {
    setCount(d.count);
    setShapeIdx(d.shapeIdx);
    void loadImageFile(d.file).then((s) => {
      setSrc(s);
      setFile(d.file);
    });
  });

  const shape = SHAPES[kind][shapeIdx];
  const cols = kind === "grid" ? 3 : count;
  const rows = kind === "grid" ? count : 1;
  const layout = useMemo(() => ({ w: cols * shape.w, h: rows * shape.h }), [cols, rows, shape]);
  const tiles = useMemo(() => splitTiles(cols, rows, shape.w, shape.h), [cols, rows, shape]);
  const current = src ?? sample;

  const load = (file: File | undefined) => {
    if (!file) return;
    loadImageFile(file).then(
      (s) => {
        setSrc(s);
        setFile(file);
        setError("");
      },
      (e: Error) => setError(e.message),
    );
  };

  const fileFor = (t: Tile) =>
    `${baseName(current?.name ?? "image")}-${kind}-${kind === "grid" ? t.order : t.col + 1}.jpg`;

  const download = (t: Tile) => {
    if (!current) return;
    const c = document.createElement("canvas");
    renderTo(c, current, layout, "cover", "#ffffff", t);
    downloadCanvas(c, fileFor(t));
  };

  const downloadAll = () => {
    const ordered = [...tiles].sort((a, b) => (kind === "grid" ? a.order - b.order : a.col - b.col));
    // Browsers drop rapid back-to-back downloads, so space them out.
    ordered.forEach((t, i) => window.setTimeout(() => download(t), i * 350));
    databullGoal("free_tool_download", { tool: T.slug });
  };

  /** Carousel: every slide, in swipe order, as one post. Grid: tile 1 (each tile is its own post). */
  const post = async () => {
    let files: File[] | undefined;
    if (src) {
      const ordered = [...tiles].sort((a, b) => (kind === "grid" ? a.order - b.order : a.col - b.col));
      const chosen = kind === "grid" ? ordered.slice(0, 1) : ordered;
      files = await Promise.all(
        chosen.map((t) => {
          const c = document.createElement("canvas");
          renderTo(c, src, layout, "cover", "#ffffff", t);
          return canvasToFile(c, fileFor(t));
        }),
      );
    }
    await postEverywhere({ files, from: T.slug }, !!session?.user, navigate, signInUrl);
  };
  const path = freeToolPath(T.slug);

  return (
    <MarketingPageLayout signedIn={!!session?.user}>
      <SeoHead title={T.metaTitle} description={T.metaDescription} path={path} canonical={absoluteUrl(path)}
        keywords={kind === "grid" ? ["instagram grid maker", "instagram grid splitter", "instagram grid cutter"] : ["instagram carousel splitter", "panorama splitter instagram", "seamless carousel"]} />
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <nav className="text-[12px] text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Social0</Link> ›{" "}
          <Link href={FREE_TOOLS_PATH} className="hover:underline">Free tools</Link> › {T.name}
        </nav>

        <header className="flex flex-col items-center gap-3 text-center">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Free tool · no signup · nothing uploaded</span>
          <h1 className="font-serif text-[clamp(30px,5vw,48px)] font-extrabold leading-tight tracking-tight text-balance text-[#333C4D] dark:text-white">{T.name}</h1>
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">{T.intro}</p>
        </header>

        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <label
            htmlFor={fileId}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); load(e.dataTransfer.files[0]); }}
            className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragging ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:border-foreground/30")}
          >
            <span className="text-[15px] font-semibold">{src ? `Using ${src.name} (${src.w} x ${src.h})` : "Drop an image here or click to choose"}</span>
            <span className="text-[13px] text-muted-foreground">
              {src ? "Drop another to replace it." : `Best with an image about ${layout.w} x ${layout.h}. The sample below shows the result.`}
            </span>
            <input id={fileId} type="file" accept="image/*" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
          </label>
          {error ? <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-4 text-[14px]">
            <span className="flex items-center gap-2">
              {kind === "grid" ? "Rows" : "Slides"}
              <span className="inline-flex flex-wrap rounded-lg border border-border p-0.5" role="group" aria-label={kind === "grid" ? "Rows" : "Slides"}>
                {COUNTS[kind].map((n) => (
                  <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)} className={chip(count === n)}>{n}</button>
                ))}
              </span>
            </span>
            <span className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Tile shape">
              {SHAPES[kind].map((s, i) => (
                <button key={s.label} type="button" aria-pressed={shapeIdx === i} onClick={() => setShapeIdx(i)} className={chip(shapeIdx === i)}>{s.label}</button>
              ))}
            </span>
            <span className="font-mono text-[12px] text-muted-foreground">
              {tiles.length} x {shape.w} x {shape.h}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={downloadAll}
              className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2.5 text-[14px] font-bold text-emerald-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2">
              Download all {tiles.length} {kind === "grid" ? "tiles" : "slides"}
            </button>
            <button type="button" onClick={() => { databullGoal("free_tool_cta", { tool: T.slug }); void post(); }}
              className="inline-flex items-center rounded-lg border border-border px-4 py-2.5 text-[14px] font-semibold hover:border-foreground/40">
              {kind === "grid" ? "Post tile 1 with Social0 →" : "Post the carousel with Social0 →"}
            </button>
          </div>
        </div>

        {current ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold">
              {kind === "grid" ? "Your grid as it will look on your profile. Numbers are the posting order." : "Your slides in swipe order."}
            </h2>
            <div className={cn("grid gap-1", kind === "grid" ? "mx-auto w-full max-w-[520px] grid-cols-3" : "overflow-x-auto")}
              style={kind === "carousel" ? { gridTemplateColumns: `repeat(${cols}, minmax(140px, 1fr))` } : undefined}>
              {tiles.map((t) => {
                const n = kind === "grid" ? t.order : t.col + 1;
                return (
                  <button key={`${t.row}-${t.col}`} type="button" onClick={() => download(t)}
                    className="group relative overflow-hidden rounded-sm bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    title={`Download ${kind === "grid" ? "tile" : "slide"} ${n}`}>
                    <TileCanvas src={current} layout={layout} tile={t} label={`${kind === "grid" ? "Tile" : "Slide"} ${n}`} />
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[12px] font-bold text-white">{n}</span>
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-[12px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Download</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="grid gap-8 md:grid-cols-3">
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">How to use it</h2>
            <ol className="list-decimal space-y-1 pl-5 text-[14px] text-muted-foreground">
              {T.howTo.map((h) => <li key={h}>{h}</li>)}
            </ol>
          </div>
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">Good to know</h2>
            <ul className="list-disc space-y-1 pl-5 text-[14px] text-muted-foreground">
              {T.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">More free tools</h2>
            <div className="flex flex-wrap gap-2">
              {[
                kind === "grid" ? [freeToolPath(INSTAGRAM_CAROUSEL.slug), "Carousel splitter"] : [freeToolPath(INSTAGRAM_GRID.slug), "Grid maker"],
                [`${IMAGE_RESIZER_PATH}/instagram`, "Instagram image sizes"],
                ["/free-tools/post-preview/instagram", "Instagram caption counter"],
              ].map(([href, label]) => (
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
