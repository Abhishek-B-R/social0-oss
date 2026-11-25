import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { absoluteUrl } from "@/lib/seo";
import { databullGoal } from "@/lib/databull";
import { baseName } from "@/lib/canvas-image";
import { drawBadge } from "@/lib/meme-render";
import { TARGETS, drawReframe, type ReframeMode } from "@/lib/reframe";
import { recordCanvas, recordingMime } from "@/lib/record-canvas";
import { postEverywhere } from "@/lib/tool-handoff";
import { useToolDraft } from "@/lib/use-tool-draft";
import { FREE_TOOLS_PATH } from "@/lib/content/free-tools";
import { MEME_VIDEO, VIDEO_RESIZER as T, freeToolPath } from "@/lib/content/free-tools-standalone";
import { IMAGE_RESIZER_PATH } from "@/lib/content/image-resizer";
import { cn } from "@/lib/utils";

type Clip = { el: HTMLVideoElement | HTMLCanvasElement; w: number; h: number; name: string };
type Saved = { file: File; target: string; mode: ReframeMode; pos: number; color: string };

const MAX_SECONDS = 60;
const MODES: [ReframeMode, string][] = [["blur", "Blurred background"], ["color", "Colour"], ["crop", "Crop to fill"]];
const seg = (on: boolean) =>
  cn("rounded-md px-3 py-1.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
    on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground");

/** Moving landscape placeholder so the tool shows a result before any upload. */
function paintSample(c: HTMLCanvasElement, t: number) {
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, c.width, 0);
  grad.addColorStop(0, "#0ea5e9");
  grad.addColorStop(1, "#10b981");
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `hsla(${40 + i * 50},90%,60%,.8)`;
    g.beginPath();
    g.arc(((t / 6 + i * 260) % (c.width + 200)) - 100, 360 + Math.sin(t / 600 + i) * 180, 70, 0, 7);
    g.fill();
  }
  g.fillStyle = "#fff";
  g.font = "700 64px 'DM Sans', sans-serif";
  g.textAlign = "center";
  g.fillText("your landscape clip", c.width / 2, c.height / 2 + 20);
}

export default function VideoResizerPage() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const signedIn = !!session?.user;
  const [clip, setClip] = useState<Clip | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [targetId, setTargetId] = useState("9x16");
  const [mode, setMode] = useState<ReframeMode>("blur");
  const [pos, setPos] = useState(0.5);
  const [color, setColor] = useState("#000000");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const blurBuf = useMemo(() => (typeof document === "undefined" ? null : document.createElement("canvas")), []);
  const fileId = useId();
  const colorId = useId();
  const posId = useId();

  const sample = useMemo<Clip | null>(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;
    return { el: c, w: 1280, h: 720, name: "social0" };
  }, []);
  const current = clip ?? sample;
  const target = TARGETS.find((t) => t.id === targetId) ?? TARGETS[0];
  const opts = useMemo(() => ({ mode, pos, color }), [mode, pos, color]);
  const live = useRef({ current, target, opts, signedIn });
  useEffect(() => {
    live.current = { current, target, opts, signedIn };
  }, [current, target, opts, signedIn]);

  // Live preview loop.
  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const { current: m, target: tg, opts: o, signedIn: si } = live.current;
      const c = preview.current;
      if (m && c && blurBuf) {
        if (m.el instanceof HTMLCanvasElement) paintSample(m.el, t);
        if (c.width !== tg.w || c.height !== tg.h) {
          c.width = tg.w;
          c.height = tg.h;
        }
        const g = c.getContext("2d")!;
        drawReframe(g, m.el, m.w, m.h, o, blurBuf);
        if (!si) drawBadge(g, tg.w, tg.h);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [blurBuf]);

  const load = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setError(f.type.startsWith("image/") ? "That's an image. Use the free image resizer for pictures." : "Use a video (MP4, MOV or WebM).");
      return;
    }
    const v = document.createElement("video");
    v.src = URL.createObjectURL(f);
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.onloadedmetadata = () => {
      if (v.duration > MAX_SECONDS) {
        setError(`That clip is ${Math.round(v.duration)} seconds. Trim it to ${MAX_SECONDS} seconds or less first.`);
        return;
      }
      videoEl.current = v;
      setClip({ el: v, w: v.videoWidth, h: v.videoHeight, name: f.name });
      setFile(f);
      setError("");
      void v.play().catch(() => undefined);
    };
    v.onerror = () => setError("This video couldn't be opened. Try an MP4 file.");
  };

  const draft = useMemo<Saved | null>(() => (file ? { file, target: targetId, mode, pos, color } : null), [file, targetId, mode, pos, color]);
  useToolDraft<Saved>("video-resizer", draft, (d) => {
    setTargetId(d.target);
    setMode(d.mode);
    setPos(d.pos);
    setColor(d.color);
    load(d.file);
  });

  const record = async (): Promise<File | null> => {
    const m = current;
    if (!m || !blurBuf || !recordingMime()) {
      setError("This browser can't record video. Try Chrome, Edge or Safari.");
      return null;
    }
    const c = document.createElement("canvas");
    c.width = target.w;
    c.height = target.h;
    const g = c.getContext("2d")!;
    const buf = document.createElement("canvas");
    return recordCanvas({
      canvas: c,
      video: clip ? videoEl.current : null,
      seconds: 4,
      name: `${baseName(m.name)}-${target.id}`,
      onProgress: setProgress,
      draw: (t) => {
        if (m.el instanceof HTMLCanvasElement) paintSample(m.el, t);
        drawReframe(g, m.el, m.w, m.h, live.current.opts, buf);
        if (!live.current.signedIn) drawBadge(g, c.width, c.height);
      },
    });
  };

  const download = async () => {
    const f = await record();
    if (!f) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    databullGoal("free_tool_download", { tool: T.slug });
  };

  const post = async () => {
    databullGoal("free_tool_cta", { tool: T.slug });
    const f = clip ? await record() : null;
    await postEverywhere({ files: f ? [f] : undefined, from: T.slug }, signedIn, navigate, signInUrl);
  };

  const path = freeToolPath(T.slug);
  const recording = progress !== null;

  return (
    <MarketingPageLayout signedIn={signedIn}>
      <SeoHead title={T.metaTitle} description={T.metaDescription} path={path} canonical={absoluteUrl(path)}
        keywords={["video resizer", "convert video to 9:16", "resize video for instagram", "resize video for tiktok", "horizontal to vertical video"]} />
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
              <span className="text-[15px] font-semibold">{clip ? `Using ${clip.name} (${clip.w} x ${clip.h})` : "Drop a video or click to choose"}</span>
              <span className="text-[13px] text-muted-foreground">MP4, MOV or WebM up to {MAX_SECONDS} s. The moving sample shows the result.</span>
              <input id={fileId} type="file" accept="video/*" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
            </label>
            {error ? <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{error}</p> : null}

            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-semibold">Shape</span>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Shape">
                {TARGETS.map((t) => (
                  <button key={t.id} type="button" aria-pressed={targetId === t.id} onClick={() => setTargetId(t.id)}
                    className={cn("flex flex-col rounded-lg border px-3 py-2 text-left", targetId === t.id ? "border-emerald-500 ring-1 ring-emerald-500" : "border-border hover:border-foreground/30")}>
                    <b className="text-[14px]">{t.label}</b>
                    <span className="text-[12px] text-muted-foreground">{t.use}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-semibold">Fill the space with</span>
              <span className="inline-flex w-fit flex-wrap rounded-lg border border-border p-0.5" role="group" aria-label="Background">
                {MODES.map(([v, l]) => <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)} className={seg(mode === v)}>{l}</button>)}
              </span>
            </div>
            {mode === "color" ? (
              <label htmlFor={colorId} className="flex items-center gap-3 text-[14px] font-semibold">
                Colour
                <input id={colorId} type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
              </label>
            ) : null}
            {mode === "crop" ? (
              <label htmlFor={posId} className="flex items-center gap-3 text-[14px] font-semibold">
                Keep in frame
                <input id={posId} type="range" min={0} max={100} value={Math.round(pos * 100)} onChange={(e) => setPos(Number(e.target.value) / 100)} className="flex-1 accent-emerald-500" />
              </label>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={recording} onClick={() => void download()}
                className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2.5 text-[14px] font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2">
                {recording ? `Recording… ${Math.round((progress ?? 0) * 100)}%` : "Download video"}
              </button>
              <button type="button" disabled={recording} onClick={() => void post()}
                className="inline-flex items-center rounded-lg border border-border px-4 py-2.5 text-[14px] font-semibold hover:border-foreground/40">
                Post it everywhere →
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground">
              {signedIn ? "You're signed in, so downloads have no badge." : (
                <>Free downloads carry a small “made with social0.app” badge. <Link href={signInUrl(path)} className="underline">Sign up free</Link> to remove it.</>
              )}{" "}
              The clip plays through once while it records; keep this tab open.
            </p>
          </div>

          <div className="flex min-w-0 justify-center rounded-2xl bg-muted/60 p-4 sm:p-5 lg:sticky lg:top-20">
            <canvas ref={preview} className="h-auto max-h-[78vh] w-auto max-w-full rounded-lg shadow-lg" aria-label="Resized video preview" />
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
              {[[freeToolPath(MEME_VIDEO.slug), "Meme video maker"], [IMAGE_RESIZER_PATH, "Image resizer"], ["/free-tools/post-preview/tiktok", "TikTok caption counter"]].map(([href, label]) => (
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
