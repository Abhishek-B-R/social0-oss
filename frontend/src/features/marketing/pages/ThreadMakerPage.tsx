import { useId, useMemo, useState } from "react";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { absoluteUrl } from "@/lib/seo";
import { databullGoal } from "@/lib/databull";
import { postCharCount } from "@/lib/platform-limits";
import { splitThread } from "@/lib/thread-split";
import { FREE_TOOLS_PATH, postPreviewPath } from "@/lib/content/free-tools";
import { THREAD_MAKER as T, THREAD_SAMPLE, freeToolPath } from "@/lib/content/free-tools-standalone";
import { cn } from "@/lib/utils";

const NETWORKS = [
  { id: "twitter_x", label: "X", limit: 280, handle: "@yourhandle" },
  { id: "threads", label: "Threads", limit: 500, handle: "yourhandle" },
  { id: "bluesky", label: "Bluesky", limit: 300, handle: "@you.bsky.social" },
] as const;

const chip = (on: boolean) =>
  cn("rounded-md px-3 py-1.5 text-[13px] font-medium", on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground");

export default function ThreadMakerPage() {
  const { data: session } = useSession();
  const [text, setText] = useState(THREAD_SAMPLE);
  const [netIdx, setNetIdx] = useState(0);
  const [numbered, setNumbered] = useState(true);
  const [breakOnBlankLines, setBreakOnBlankLines] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const textId = useId();
  const numId = useId();
  const blankId = useId();
  const net = NETWORKS[netIdx];

  const posts = useMemo(
    () => splitThread(text, { platform: net.id, limit: net.limit, numbered, breakOnBlankLines }),
    [text, net, numbered, breakOnBlankLines],
  );

  const copy = async (i: number) => {
    try {
      await navigator.clipboard.writeText(posts[i]);
      setCopied(i);
      databullGoal("free_tool_copy", { tool: T.slug });
      window.setTimeout(() => setCopied(null), 1200);
    } catch {
      // Clipboard blocked: the text is visible and selectable.
    }
  };

  const target = `/dashboard/new?${posts.map((p) => `part=${encodeURIComponent(p)}`).join("&")}`;
  const scheduleHref = session?.user ? target : signInUrl(target);
  const path = freeToolPath(T.slug);

  return (
    <MarketingPageLayout signedIn={!!session?.user}>
      <SeoHead title={T.metaTitle} description={T.metaDescription} path={path} canonical={absoluteUrl(path)}
        keywords={["twitter thread maker", "thread maker", "tweet splitter", "x thread generator"]} />
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <nav className="text-[12px] text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Social0</Link> ›{" "}
          <Link href={FREE_TOOLS_PATH} className="hover:underline">Free tools</Link> › Thread maker
        </nav>

        <header className="flex flex-col items-center gap-3 text-center">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Free tool · no signup</span>
          <h1 className="font-serif text-[clamp(30px,5vw,48px)] font-extrabold leading-tight tracking-tight text-balance text-[#333C4D] dark:text-white">{T.name}</h1>
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">{T.intro}</p>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Network">
                {NETWORKS.map((n, i) => (
                  <button key={n.id} type="button" aria-pressed={netIdx === i} onClick={() => setNetIdx(i)} className={chip(netIdx === i)}>
                    {n.label} · {n.limit}
                  </button>
                ))}
              </span>
            </div>
            <label htmlFor={textId} className="text-[14px] font-semibold">Your text</label>
            <textarea id={textId} value={text} onChange={(e) => setText(e.target.value)} rows={14}
              className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-[15px] leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50" />
            <div className="flex flex-col gap-2 text-[14px]">
              <label htmlFor={numId} className="flex cursor-pointer items-center gap-2">
                <input id={numId} type="checkbox" checked={numbered} onChange={(e) => setNumbered(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                Number the posts (1/{posts.length || 1})
              </label>
              <label htmlFor={blankId} className="flex cursor-pointer items-center gap-2">
                <input id={blankId} type="checkbox" checked={breakOnBlankLines} onChange={(e) => setBreakOnBlankLines(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                Start a new post at every blank line
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a href={scheduleHref} onClick={() => databullGoal("free_tool_cta", { tool: T.slug })}
                className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2.5 text-[14px] font-bold text-emerald-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2">
                Schedule this thread free →
              </a>
              <span className="text-[13px] text-muted-foreground">Opens Social0 with all {posts.length} posts in place.</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-muted/60 p-4 sm:p-5">
            <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              {posts.length} {posts.length === 1 ? "post" : "posts"} on {net.label}
            </span>
            <ol className="flex flex-col">
              {posts.map((p, i) => {
                const n = postCharCount(p, net.id);
                return (
                  <li key={i} className="relative flex gap-3 pb-3">
                    {i < posts.length - 1 ? <span className="absolute left-[19px] top-11 bottom-0 w-0.5 bg-border" aria-hidden /> : null}
                    <span className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-emerald-400 to-sky-500" aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px]"><b>Your Name</b> <span className="text-muted-foreground">{net.handle}</span></span>
                        <span className={cn("font-mono text-[12px] tabular-nums", n > net.limit ? "text-red-600" : "text-muted-foreground")}>{n}/{net.limit}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{p}</p>
                      <button type="button" onClick={() => copy(i)} className="self-end rounded-md border border-border px-2 py-1 text-[12px] font-semibold hover:border-emerald-500">
                        {copied === i ? "Copied" : `Copy post ${i + 1}`}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
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
              {[[postPreviewPath("x"), "X character counter"], ["/free-tools/linkedin-text-formatter", "LinkedIn text formatter"], [postPreviewPath("threads"), "Threads counter"]].map(([href, label]) => (
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
