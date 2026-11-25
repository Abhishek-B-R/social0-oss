import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { absoluteUrl } from "@/lib/seo";
import { databullGoal } from "@/lib/databull";
import { FREE_TOOLS_PATH, postPreviewPath } from "@/lib/content/free-tools";
import {
  IMAGE_RESIZER_PATH,
  RESIZER_PLATFORMS,
  resizerPath,
  type ImageFormat,
} from "@/lib/content/image-resizer";
import { cn } from "@/lib/utils";
import { baseName, canvasToFile, downloadCanvas, loadImageFile, renderTo, sampleSource, type ImageSource } from "@/lib/canvas-image";
import { postEverywhere } from "@/lib/tool-handoff";
import { useToolDraft } from "@/lib/use-tool-draft";

type Source = ImageSource;
type Mode = "cover" | "contain";

const HUB = {
  metaTitle: "Social Media Image Resizer: Every Platform Size (Free) | Social0",
  metaDescription:
    "Upload one image and get it sized for Instagram, X, LinkedIn, Facebook, YouTube, TikTok, Pinterest, Threads and Bluesky. Free, nothing uploaded.",
};

function draw(canvas: HTMLCanvasElement, src: Source, f: ImageFormat, mode: Mode, bg: string, scale = 1) {
  renderTo(canvas, src, f, mode, bg, undefined, scale);
}

function Tile({ src, f, mode, bg, platform, onPost }: { src: Source; f: ImageFormat; mode: Mode; bg: string; platform: string; onPost: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) draw(ref.current, src, f, mode, bg, Math.min(1, 320 / Math.max(f.w, f.h)));
  }, [src, f, mode, bg]);

  const download = () => {
    const c = document.createElement("canvas");
    draw(c, src, f, mode, bg);
    downloadCanvas(c, `${baseName(src.name)}-${platform}-${f.w}x${f.h}.jpg`);
    databullGoal("free_tool_download", { tool: `image-resizer/${platform}` });
  };

  return (
    <figure className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex h-44 items-center justify-center rounded-lg bg-muted/70 p-2">
        <canvas ref={ref} className="max-h-full max-w-full rounded shadow-sm" aria-label={`${f.label} preview`} />
      </div>
      <figcaption className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <b className="block text-[14px]">{f.label}</b>
          <span className="font-mono text-[12px] text-muted-foreground">{f.w} x {f.h}</span>
          {f.note ? <span className="block text-[12px] text-muted-foreground">{f.note}</span> : null}
        </span>
        <span className="flex shrink-0 flex-col gap-1">
        <button type="button" onClick={download}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-semibold hover:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50">
          Download
        </button>
        <button type="button" onClick={onPost}
          className="rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-semibold hover:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50">
          Post
        </button>
        </span>
      </figcaption>
    </figure>
  );
}

export default function ImageResizerPage() {
  const { platform: slug } = useParams();
  const p = slug ? RESIZER_PLATFORMS.find((x) => x.slug === slug) : null;
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [src, setSrc] = useState<Source | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("cover");
  const [bg, setBg] = useState("#ffffff");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileId = useId();
  const bgId = useId();
  const sample = useMemo(() => (typeof document === "undefined" ? null : sampleSource()), []);
  const draft = useMemo(() => (file ? { file, mode, bg } : null), [file, mode, bg]);
  useToolDraft<{ file: File; mode: Mode; bg: string }>("image-resizer", draft, (d) => {
    setMode(d.mode);
    setBg(d.bg);
    void loadImageFile(d.file).then((s) => {
      setSrc(s);
      setFile(d.file);
    });
  });

  if (slug && !p) return <Navigate to={IMAGE_RESIZER_PATH} replace />;

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

  const current = src ?? sample;
  const groups = p ? [p] : RESIZER_PLATFORMS;
  const title = p ? `${p.name} Image Resizer` : "Social Media Image Resizer";
  const meta = p ?? HUB;
  const path = p ? resizerPath(p.slug) : IMAGE_RESIZER_PATH;
  /** Render one size (the page's first by default) and open it in the composer. */
  const post = async (f: ImageFormat = groups[0].formats[0], platform = groups[0].slug) => {
    let files: File[] | undefined;
    if (src) {
      const c = document.createElement("canvas");
      draw(c, src, f, mode, bg);
      files = [await canvasToFile(c, `${baseName(src.name)}-${platform}-${f.w}x${f.h}.jpg`)];
    }
    await postEverywhere({ files, from: `image-resizer/${platform}` }, !!session?.user, navigate, signInUrl);
  };

  return (
    <MarketingPageLayout signedIn={!!session?.user}>
      <SeoHead title={meta.metaTitle} description={meta.metaDescription} path={path} canonical={absoluteUrl(path)}
        keywords={[`${p?.name ?? "social media"} image resizer`, `${p?.name ?? "social media"} image size`]} />
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <nav className="text-[12px] text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Social0</Link> ›{" "}
          <Link href={FREE_TOOLS_PATH} className="hover:underline">Free tools</Link> ›{" "}
          {p ? <><Link href={IMAGE_RESIZER_PATH} className="hover:underline">Image resizer</Link> › {p.name}</> : "Image resizer"}
        </nav>

        <header className="flex flex-col items-center gap-3 text-center">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Free tool · no signup · nothing uploaded</span>
          <h1 className="font-serif text-[clamp(30px,5vw,48px)] font-extrabold leading-tight tracking-tight text-balance text-[#333C4D] dark:text-white">{title}</h1>
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">
            {p
              ? `Drop in any image and get every ${p.name} size at once, cropped to fill or fitted with a background. It all runs in your browser.`
              : "Drop in one image and get it sized for all 9 networks at once, cropped to fill or fitted with a background. It all runs in your browser."}
          </p>
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
            <span className="text-[13px] text-muted-foreground">{src ? "Drop another to replace it." : "JPG, PNG, WebP or GIF. The sample below shows what you'll get."}</span>
            <input id={fileId} type="file" accept="image/*" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
          </label>
          {error ? <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-4 text-[14px]">
            <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Fit">
              {(["cover", "contain"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                  className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", mode === m ? "bg-foreground text-background" : "text-muted-foreground")}>
                  {m === "cover" ? "Crop to fill" : "Fit with background"}
                </button>
              ))}
            </div>
            {mode === "contain" ? (
              <label htmlFor={bgId} className="flex items-center gap-2">
                Background
                <input id={bgId} type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
              </label>
            ) : null}
            <button type="button" onClick={() => { databullGoal("free_tool_cta", { tool: `image-resizer/${p?.slug ?? "all"}` }); void post(); }}
              className="ml-auto inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2 text-[14px] font-bold text-emerald-950 hover:bg-emerald-400">
              Post it everywhere with Social0 →
            </button>
          </div>
        </div>

        {current ? groups.map((g) => (
          <section key={g.slug} className="flex flex-col gap-3">
            {!p ? (
              <h2 className="text-[18px] font-semibold">
                <Link href={resizerPath(g.slug)} className="hover:underline">{g.name}</Link>
              </h2>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {g.formats.map((f) => <Tile key={f.label} src={current} f={f} mode={mode} bg={bg} platform={g.slug} onPost={() => { databullGoal("free_tool_cta", { tool: `image-resizer/${g.slug}` }); void post(f, g.slug); }} />)}
            </div>
          </section>
        )) : null}

        <section className="grid gap-8 md:grid-cols-3">
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">How to use it</h2>
            <ol className="list-decimal space-y-1 pl-5 text-[14px] text-muted-foreground">
              <li>Drop in your image.</li>
              <li>Choose Crop to fill, or Fit with background to keep the whole picture.</li>
              <li>Download the sizes you need as JPG.</li>
            </ol>
          </div>
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">Crop or fit?</h2>
            <p className="text-[14px] text-muted-foreground">Crop to fill keeps the image full-bleed and trims the edges evenly. Fit with background keeps everything visible and fills the gaps with a colour, which suits logos, screenshots and text.</p>
          </div>
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">{p ? "Other platforms" : "More free tools"}</h2>
            <div className="flex flex-wrap gap-2">
              {(p ? RESIZER_PLATFORMS.filter((x) => x.slug !== p.slug).slice(0, 4).map((x) => [resizerPath(x.slug), `${x.name} sizes`]) : [[postPreviewPath("linkedin"), "LinkedIn post preview"], ["/free-tools/linkedin-text-formatter", "LinkedIn text formatter"], [postPreviewPath("x"), "X character counter"]]).map(([href, label]) => (
                <Link key={href} href={href} className="rounded-full border border-border px-3 py-1 text-[13px] hover:border-foreground/40">{label}</Link>
              ))}
              <Link href={FREE_TOOLS_PATH} className="rounded-full border border-border px-3 py-1 text-[13px] hover:border-foreground/40">All free tools</Link>
            </div>
          </div>
        </section>

        {p ? (
          <section className="max-w-[760px]">
            <h2 className="mb-3 font-serif text-[24px] font-bold">Tips for {p.name} images</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-[14px] text-muted-foreground">
              {p.tips.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </section>
        ) : null}

        {p ? (
          <section className="max-w-[760px]">
            <h2 className="mb-3 font-serif text-[24px] font-bold">FAQ</h2>
            <div className="flex flex-col divide-y divide-border">
              {p.faq.map((f) => (
                <details key={f.question} className="py-3">
                  <summary className="cursor-pointer text-[15px] font-semibold">{f.question}</summary>
                  <p className="mt-2 text-[14px] text-muted-foreground">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </MarketingPageLayout>
  );
}
