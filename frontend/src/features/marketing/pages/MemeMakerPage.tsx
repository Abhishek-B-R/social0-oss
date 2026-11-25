import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { absoluteUrl } from "@/lib/seo";
import { databullGoal } from "@/lib/databull";
import { baseName, downloadCanvas, sampleSource } from "@/lib/canvas-image";
import { MEME_FONTS_URL, drawMeme, memeSize, type MemeOptions, type MemeStyle } from "@/lib/meme-render";
import { FREE_TOOLS_PATH } from "@/lib/content/free-tools";
import { MEME_IMAGE, MEME_VIDEO, freeToolPath } from "@/lib/content/free-tools-standalone";
import { cn } from "@/lib/utils";

type Kind = "video" | "image";
type Media = { el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement; w: number; h: number; name: string; video: boolean };

const STYLES: [MemeStyle, string][] = [["bar", "Caption bar"], ["impact", "Top & bottom"], ["sub", "Subtitle"]];
const MAX_SECONDS = 60;
const PREVIEW_W = 640;
const EXPORT_W = { video: 720, image: 1080 } as const;
const audioSources = new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>();
let audioCtx: AudioContext | null = null;

const seg = (on: boolean) =>
  cn("rounded-md px-3 py-1.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
    on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground");

/** Moving placeholder so the video tool shows motion before anyone uploads. */
function makeSampleClip(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 960;
  c.height = 720;
  return c;
}
function paintSampleClip(c: HTMLCanvasElement, t: number) {
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, "#0e3b43");
  grad.addColorStop(1, "#1d6b5b");
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `hsla(${150 + i * 30},70%,60%,.55)`;
    g.beginPath();
    g.arc(480 + Math.cos(t / 900 + i) * 300, 360 + Math.sin(t / 700 + i * 1.7) * 200, 60 + 20 * Math.sin(t / 500 + i), 0, 7);
    g.fill();
  }
  g.fillStyle = "rgba(255,255,255,.9)";
  g.font = "700 44px 'DM Sans', sans-serif";
  g.textAlign = "center";
  g.fillText("your clip plays here", 480, 370);
}

function sizeCanvas(c: HTMLCanvasElement, m: Media, o: MemeOptions, width: number) {
  const g = c.getContext("2d")!;
  g.font = `900 ${Math.round((width / 15.5) * (o.size / 100))}px Nunito, sans-serif`;
  const L = memeSize(o, m.w, m.h, width, (t) => g.measureText(t).width);
  if (c.width !== L.width || c.height !== L.height) {
    c.width = L.width;
    c.height = L.height;
  }
}

function pickMime(): string {
  const options = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export default function MemeMakerPage({ kind }: { kind: Kind }) {
  const T = kind === "video" ? MEME_VIDEO : MEME_IMAGE;
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const [media, setMedia] = useState<Media | null>(null);
  const [style, setStyle] = useState<MemeStyle>("bar");
  const [theme, setTheme] = useState<"white" | "black">("white");
  const [size, setSize] = useState(100);
  const [caption, setCaption] = useState(
    kind === "video"
      ? "Me shipping a feature at 2 AM because one user asked for it"
      : "When the build passes on the first try",
  );
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const fileId = useId();
  const capId = useId();
  const sizeId = useId();
  const opts: MemeOptions = useMemo(() => ({ style, theme, size, caption, watermark: !signedIn }), [style, theme, size, caption, signedIn]);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);
  const videoEl = useRef<HTMLVideoElement | null>(null);

  const sample = useMemo<Media | null>(() => {
    if (typeof document === "undefined") return null;
    if (kind === "video") return { el: makeSampleClip(), w: 960, h: 720, name: "meme", video: false };
    const s = sampleSource(1200, 900);
    return { el: s.img as HTMLCanvasElement, w: s.w, h: s.h, name: "meme", video: false };
  }, [kind]);
  const current = media ?? sample;
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Meme fonts (Nunito 900, Anton) only load on this page.
  useEffect(() => {
    if (!document.querySelector(`link[href="${MEME_FONTS_URL}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = MEME_FONTS_URL;
      document.head.appendChild(l);
    }
    void document.fonts?.load("900 40px Nunito");
    void document.fonts?.load("40px Anton");
  }, []);

  // Live preview loop.
  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const m = currentRef.current;
      const c = preview.current;
      if (m && c) {
        if (!media && kind === "video") paintSampleClip(m.el as HTMLCanvasElement, t);
        sizeCanvas(c, m, optsRef.current, PREVIEW_W);
        drawMeme(c.getContext("2d")!, m.el, m.w, m.h, optsRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [media, kind]);

  const load = (file: File | undefined) => {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    if (kind === "video" ? !isVideo && !file.type.startsWith("image/") : !file.type.startsWith("image/")) {
      setError(kind === "video" ? "Use a video (MP4, MOV, WebM) or an image." : "Use an image (JPG, PNG, WebP or GIF).");
      return;
    }
    const url = URL.createObjectURL(file);
    if (isVideo) {
      const v = document.createElement("video");
      v.src = url;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.onloadedmetadata = () => {
        if (v.duration > MAX_SECONDS) {
          setError(`That clip is ${Math.round(v.duration)} seconds. Trim it to ${MAX_SECONDS} seconds or less first.`);
          return;
        }
        videoEl.current = v;
        setMedia({ el: v, w: v.videoWidth, h: v.videoHeight, name: file.name, video: true });
        setError("");
        void v.play().catch(() => undefined);
      };
      v.onerror = () => setError("This video couldn't be opened. Try an MP4 file.");
    } else {
      const img = new Image();
      img.onload = () => {
        setMedia({ el: img, w: img.naturalWidth, h: img.naturalHeight, name: file.name, video: false });
        setError("");
      };
      img.onerror = () => setError("This image couldn't be opened. Try a JPG or PNG.");
      img.src = url;
    }
  };

  const downloadImage = () => {
    if (!current) return;
    const c = document.createElement("canvas");
    sizeCanvas(c, current, opts, EXPORT_W.image);
    drawMeme(c.getContext("2d")!, current.el, current.w, current.h, opts);
    downloadCanvas(c, `${baseName(current.name)}-meme.jpg`);
    databullGoal("free_tool_download", { tool: T.slug });
  };

  const recordVideo = async () => {
    const m = current;
    const mime = pickMime();
    if (!m || !mime) {
      setError("This browser can't record video. Try Chrome, Edge or Safari.");
      return;
    }
    const c = document.createElement("canvas");
    sizeCanvas(c, m, opts, EXPORT_W.video);
    const g = c.getContext("2d")!;
    const stream = c.captureStream(30);
    const v = m.video ? videoEl.current : null;
    if (v) {
      // Route the clip's sound into the recording only, not the speakers.
      audioCtx ??= new AudioContext();
      await audioCtx.resume();
      let source = audioSources.get(v);
      if (!source) {
        source = audioCtx.createMediaElementSource(v);
        audioSources.set(v, source);
      }
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      v.pause();
      v.loop = false;
      v.muted = false;
      v.currentTime = 0;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const duration = v ? v.duration : 4;
    const started = performance.now();
    let raf = 0;
    const draw = (t: number) => {
      if (!media) paintSampleClip(m.el as HTMLCanvasElement, t);
      drawMeme(g, m.el, m.w, m.h, optsRef.current);
      const elapsed = v ? v.currentTime : (performance.now() - started) / 1000;
      setProgress(Math.min(1, elapsed / duration));
      if (!v && elapsed >= duration) rec.stop();
      else raf = requestAnimationFrame(draw);
    };
    rec.onstop = () => {
      cancelAnimationFrame(raf);
      setProgress(null);
      if (v) {
        v.muted = true;
        v.loop = true;
        void v.play().catch(() => undefined);
      }
      const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(chunks, { type: mime.split(";")[0] }));
      a.download = `${baseName(m.name)}-meme.${ext}`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    if (v) v.onended = () => rec.state === "recording" && rec.stop();
    rec.start(250);
    if (v) await v.play();
    raf = requestAnimationFrame(draw);
    databullGoal("free_tool_download", { tool: T.slug });
  };

  const path = freeToolPath(T.slug);
  const scheduleHref = signedIn ? "/dashboard/new" : signInUrl("/dashboard/new");
  const recording = progress !== null;

  return (
    <MarketingPageLayout signedIn={signedIn}>
      <SeoHead title={T.metaTitle} description={T.metaDescription} path={path} canonical={absoluteUrl(path)}
        keywords={kind === "video" ? ["meme video maker", "add text to video meme", "caption video meme", "video meme generator"] : ["meme generator", "meme maker", "caption meme generator", "add text to image meme"]} />
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

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <label htmlFor={fileId}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); load(e.dataTransfer.files[0]); }}
              className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors",
                dragging ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:border-foreground/30")}>
              <span className="text-[15px] font-semibold">{media ? `Using ${media.name}` : kind === "video" ? "Drop a video or click to choose" : "Drop an image or click to choose"}</span>
              <span className="text-[13px] text-muted-foreground">{kind === "video" ? `MP4, MOV or WebM up to ${MAX_SECONDS} s. Images work too.` : "JPG, PNG, WebP or GIF."}</span>
              <input id={fileId} type="file" accept={kind === "video" ? "video/*,image/*" : "image/*"} className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
            </label>
            {error ? <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{error}</p> : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={capId} className="text-[14px] font-semibold">Caption</label>
              <textarea id={capId} value={caption} onChange={(e) => setCaption(e.target.value)} rows={3}
                className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-[15px] leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50" />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-semibold">Style</span>
              <span className="inline-flex w-fit flex-wrap rounded-lg border border-border p-0.5" role="group" aria-label="Style">
                {STYLES.map(([v, l]) => <button key={v} type="button" aria-pressed={style === v} onClick={() => setStyle(v)} className={seg(style === v)}>{l}</button>)}
              </span>
            </div>
            {style === "bar" ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold">Bar colour</span>
                <span className="inline-flex w-fit rounded-lg border border-border p-0.5" role="group" aria-label="Bar colour">
                  {(["white", "black"] as const).map((v) => <button key={v} type="button" aria-pressed={theme === v} onClick={() => setTheme(v)} className={seg(theme === v)}>{v === "white" ? "White" : "Black"}</button>)}
                </span>
              </div>
            ) : null}
            <label htmlFor={sizeId} className="flex items-center gap-3 text-[14px] font-semibold">
              Text size
              <input id={sizeId} type="range" min={70} max={130} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 accent-emerald-500" />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={recording} onClick={kind === "video" ? () => void recordVideo() : downloadImage}
                className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2.5 text-[14px] font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2">
                {recording ? `Recording… ${Math.round((progress ?? 0) * 100)}%` : kind === "video" ? "Download video" : "Download JPG"}
              </button>
              <a href={scheduleHref} onClick={() => databullGoal("free_tool_cta", { tool: T.slug })}
                className="inline-flex items-center rounded-lg border border-border px-4 py-2.5 text-[14px] font-semibold hover:border-foreground/40">
                Post it everywhere →
              </a>
            </div>
            <p className="text-[12px] text-muted-foreground">
              {signedIn ? "You're signed in, so downloads have no badge." : (
                <>Free downloads carry a small “made with social0.app” badge. <Link href={signInUrl(path)} className="underline">Sign up free</Link> to remove it.</>
              )}
              {kind === "video" ? " The clip plays through once while it records; keep this tab open." : null}
            </p>
          </div>

          <div className="flex min-w-0 justify-center rounded-2xl bg-muted/60 p-4 sm:p-5 lg:sticky lg:top-20">
            <canvas ref={preview} className="h-auto max-h-[78vh] w-auto max-w-full rounded-lg shadow-lg" aria-label="Meme preview" />
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
              {[
                kind === "video" ? [freeToolPath(MEME_IMAGE.slug), "Meme generator (images)"] : [freeToolPath(MEME_VIDEO.slug), "Meme video maker"],
                ["/free-tools/image-resizer", "Image resizer"],
                ["/free-tools/twitter-thread-maker", "Thread maker"],
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
