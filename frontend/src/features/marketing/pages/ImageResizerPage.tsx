import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
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
  fitRect,
  resizerPath,
  type ImageFormat,
} from "@/lib/content/image-resizer";
import { cn } from "@/lib/utils";

type Source = { img: CanvasImageSource; w: number; h: number; name: string };
type Mode = "cover" | "contain";

const HUB = {
  metaTitle: "Social Media Image Resizer: Every Platform Size (Free) | Social0",
  metaDescription:
    "Upload one image and get it sized for Instagram, X, LinkedIn, Facebook, YouTube, TikTok, Pinterest, Threads and Bluesky. Free, nothing uploaded.",
};

/** A placeholder picture so the tool shows real output before anyone uploads. */
function sampleSource(): Source {
  const c = document.createElement("canvas");
  c.width = 1600;
  c.height = 1067;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 1600, 1067);
  grad.addColorStop(0, "#10b981");
  grad.addColorStop(1, "#0ea5e9");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1600, 1067);
  g.fillStyle = "rgba(255,255,255,.92)";
  g.font = "bold 110px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("Your image here", 800, 520);
  g.font = "56px system-ui, sans-serif";
  g.fillText("sample 1600 x 1067", 800, 620);
  return { img: c, w: 1600, h: 1067, name: "sample" };
}

function draw(canvas: HTMLCanvasElement, src: Source, f: ImageFormat, mode: Mode, bg: string, scale = 1) {
  canvas.width = Math.round(f.w * scale);
  canvas.height = Math.round(f.h * scale);
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.fillStyle = bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const r = fitRect(src.w, src.h, canvas.width, canvas.height, mode);
  g.drawImage(src.img, r.x, r.y, r.w, r.h);
}

function Tile({ src, f, mode, bg, platform }: { src: Source; f: ImageFormat; mode: Mode; bg: string; platform: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) draw(ref.current, src, f, mode, bg, Math.min(1, 320 / Math.max(f.w, f.h)));
  }, [src, f, mode, bg]);

  const download = () => {
    const c = document.createElement("canvas");
    draw(c, src, f, mode, bg);
    c.toBlob(
      (blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${src.name.replace(/\.[^.]+$/, "")}-${platform}-${f.w}x${f.h}.jpg`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      },
      "image/jpeg",
      0.92,
    );
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
        <button type="button" onClick={download}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-semibold hover:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50">
          Download
        </button>
      </figcaption>
    </figure>
  );
}

export default function ImageResizerPage() {
  const { platform: slug } = useParams();
  const p = slug ? RESIZER_PLATFORMS.find((x) => x.slug === slug) : null;
  const { data: session } = useSession();
  const [src, setSrc] = useState<Source | null>(null);
  const [mode, setMode] = useState<Mode>("cover");
  const [bg, setBg] = useState("#ffffff");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileId = useId();
  const bgId = useId();
  const sample = useMemo(() => (typeof document === "undefined" ? null : sampleSource()), []);

  if (slug && !p) return <Navigate to={IMAGE_RESIZER_PATH} replace />;

  const load = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image. Use a JPG, PNG, WebP or GIF.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setSrc({ img, w: img.naturalWidth, h: img.naturalHeight, name: file.name });
      setError("");
    };
    img.onerror = () => setError("This image couldn't be opened. Try saving it as JPG or PNG first.");
    img.src = url;
  };

  const current = src ?? sample;
  const groups = p ? [p] : RESIZER_PLATFORMS;
  const title = p ? `${p.name} Image Resizer` : "Social Media Image Resizer";
  const meta = p ?? HUB;
  const path = p ? resizerPath(p.slug) : IMAGE_RESIZER_PATH;
  const scheduleHref = session?.user ? "/dashboard/new" : signInUrl("/dashboard/new");

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
            <a href={scheduleHref} onClick={() => databullGoal("free_tool_cta", { tool: `image-resizer/${p?.slug ?? "all"}` })}
              className="ml-auto inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2 text-[14px] font-bold text-emerald-950 hover:bg-emerald-400">
              Post it everywhere with Social0 →
            </a>
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
              {g.formats.map((f) => <Tile key={f.label} src={current} f={f} mode={mode} bg={bg} platform={g.slug} />)}
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
