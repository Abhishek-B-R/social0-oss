import { useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { absoluteUrl } from "@/lib/seo";
import { databullGoal } from "@/lib/databull";
import { postEverywhere } from "@/lib/tool-handoff";
import { useToolDraft } from "@/lib/use-tool-draft";
import { postCharCount } from "@/lib/platform-limits";
import { listify, toPlain, toggleStyle, type TextStyle } from "@/lib/unicode-text";
import { FREE_TOOLS_PATH, postPreviewPath } from "@/lib/content/free-tools";
import { FORMATTER_SAMPLE, LINKEDIN_FORMATTER as T, freeToolPath } from "@/lib/content/free-tools-standalone";
import { cn } from "@/lib/utils";

const LIMIT = 3000;
const FOLD = 210;

const STYLES: { style: TextStyle; label: string; sample: string }[] = [
  { style: "bold", label: "Bold", sample: "𝗕" },
  { style: "italic", label: "Italic", sample: "𝘐" },
  { style: "boldItalic", label: "Bold italic", sample: "𝘽" },
  { style: "underline", label: "Underline", sample: "U̲" },
  { style: "strike", label: "Strikethrough", sample: "S̶" },
  { style: "mono", label: "Monospace", sample: "𝙼" },
];

const btn =
  "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[13px] font-medium hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50";

function cut(text: string, n: number): string {
  return [...new Intl.Segmenter().segment(text)].slice(0, n).map((s) => s.segment).join("");
}

export default function LinkedInFormatterPage() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [text, setText] = useState(FORMATTER_SAMPLE);
  useToolDraft<string>("linkedin-formatter", text, setText);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const textId = useId();

  /** Run `fn` on the selection (or everything when nothing is selected) and keep it selected. */
  const edit = (fn: (s: string) => string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const [start, end] = a === b ? [0, text.length] : [a, b];
    const next = fn(text.slice(start, end));
    setText(text.slice(0, start) + next + text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, start + next.length);
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ref.current?.select();
      return;
    }
    setCopied(true);
    databullGoal("free_tool_copy", { tool: T.slug });
    window.setTimeout(() => setCopied(false), 1500);
  };

  const count = postCharCount(text, "linkedin");
  const folded = count > FOLD;
  const post = () =>
    postEverywhere({ text, from: T.slug }, !!session?.user, navigate, signInUrl);

  return (
    <MarketingPageLayout signedIn={!!session?.user}>
      <SeoHead
        title={T.metaTitle}
        description={T.metaDescription}
        path={freeToolPath(T.slug)}
        canonical={absoluteUrl(freeToolPath(T.slug))}
        keywords={["linkedin text formatter", "linkedin bold text", "linkedin italic text", "bold text generator"]}
      />
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <nav className="text-[12px] text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Social0</Link> ›{" "}
          <Link href={FREE_TOOLS_PATH} className="hover:underline">Free tools</Link> › {T.name}
        </nav>

        <header className="flex flex-col items-center gap-3 text-center">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Free tool · no signup</span>
          <h1 className="font-serif text-[clamp(30px,5vw,48px)] font-extrabold leading-tight tracking-tight text-balance text-[#333C4D] dark:text-white">
            {T.name}
          </h1>
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">{T.intro}</p>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Text style">
              {STYLES.map((s) => (
                <button key={s.style} type="button" className={btn} title={s.label} aria-label={s.label}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => edit((x) => toggleStyle(x, s.style))}>
                  <span className="text-[15px]">{s.sample}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              ))}
              <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => edit((x) => listify(x, "bullet"))}>• List</button>
              <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => edit((x) => listify(x, "number"))}>1. List</button>
              <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => edit(toPlain)}>Clear style</button>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={textId} className="text-[14px] font-semibold">Your post</label>
              <span className={cn("font-mono text-[13px] tabular-nums", count > LIMIT ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                {count.toLocaleString()} / {LIMIT.toLocaleString()}
              </span>
            </div>
            <textarea
              id={textId}
              ref={ref}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-[15px] leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            />
            <p className="text-[12px] text-muted-foreground">Select words first. With nothing selected, the button styles the whole post.</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={copy}
                className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2.5 text-[14px] font-bold text-emerald-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2">
                {copied ? "Copied" : "Copy formatted text"}
              </button>
              <button type="button" onClick={() => { databullGoal("free_tool_cta", { tool: T.slug }); void post(); }}
                className="inline-flex items-center rounded-lg border border-border px-4 py-2.5 text-[14px] font-semibold hover:border-foreground/40">
                Schedule this post free →
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-muted/60 p-4 sm:p-5 lg:sticky lg:top-20">
            <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">LinkedIn preview</span>
            <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2.5">
                <span className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-emerald-400 to-sky-500" aria-hidden />
                <span className="leading-tight">
                  <b className="block text-[14px]">Your Name</b>
                  <span className="text-[12px] text-muted-foreground">Your headline · now</span>
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                {folded ? cut(text, FOLD).trimEnd() : text}
                {folded ? <span className="font-semibold text-muted-foreground"> …more</span> : null}
              </p>
            </article>
            <p className="text-[12px] text-muted-foreground">
              The feed shows about {FOLD} characters before “…more”. Put the hook there.
            </p>
          </div>
        </div>

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
              {[["linkedin", "LinkedIn post preview"], ["x", "X character counter"], ["instagram", "Instagram caption counter"]].map(([slug, label]) => (
                <Link key={slug} href={postPreviewPath(slug)} className="rounded-full border border-border px-3 py-1 text-[13px] hover:border-foreground/40">{label}</Link>
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
