import { useEffect, useId, useState } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import Link from "@/components/AppLink";
import { ToolHero } from "@/components/landing/ToolHero";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { absoluteUrl } from "@/lib/seo";
import { databullGoal } from "@/lib/databull";
import { postEverywhere } from "@/lib/tool-handoff";
import { getLimitForAccount, postCharCount } from "@/lib/platform-limits";
import {
  FREE_TOOLS_PATH,
  PREVIEW_PLATFORMS,
  SAMPLE_POST,
  postPreviewPath,
  type PreviewPlatform,
} from "@/lib/content/free-tools";
import { cn } from "@/lib/utils";

const DRAFT_KEY = "s0_free_tool_text";

function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? SAMPLE_POST;
  } catch {
    return SAMPLE_POST;
  }
}

function limitFor(p: PreviewPlatform, premium: boolean): number {
  return getLimitForAccount({ platform: p.platform, isTwitterPremium: premium });
}

/** Fold point: X Premium folds at 280; others use the platform's feed fold. */
function foldFor(p: PreviewPlatform, premium: boolean): number | null {
  return p.platform === "twitter_x" ? (premium ? 280 : null) : p.fold;
}

/** Cut `text` so that `count(cut) <= max`, by grapheme. */
function cutTo(text: string, max: number, platform: string): string {
  const parts = [...new Intl.Segmenter().segment(text)].map((s) => s.segment);
  let out = "";
  for (const g of parts) {
    if (postCharCount(out + g, platform) > max) break;
    out += g;
  }
  return out;
}

function PreviewBody({ p, text, premium }: { p: PreviewPlatform; text: string; premium: boolean }) {
  const limit = limitFor(p, premium);
  const fold = foldFor(p, premium);
  if (postCharCount(text, p.platform) > limit) {
    const ok = cutTo(text, limit, p.platform);
    return (
      <>
        {ok}
        <mark className="rounded-sm bg-red-500/20 text-inherit">{text.slice(ok.length)}</mark>
      </>
    );
  }
  if (fold && postCharCount(text, p.platform) > fold) {
    return (
      <>
        {cutTo(text, fold, p.platform).trimEnd()}
        <span className="font-semibold text-muted-foreground">
          {" "}
          {p.platform === "twitter_x" ? "Show more" : p.foldLabel}
        </span>
      </>
    );
  }
  return <>{text}</>;
}

function Meter({ p, text, premium, active }: { p: PreviewPlatform; text: string; premium: boolean; active: boolean }) {
  const n = postCharCount(text, p.platform);
  const limit = limitFor(p, premium);
  const ratio = n / limit;
  const over = ratio > 1;
  return (
    <Link
      href={postPreviewPath(p.slug)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border bg-background px-3 py-2 text-left transition-colors",
        active ? "border-emerald-500 ring-1 ring-emerald-500" : "border-border hover:border-foreground/30",
      )}
    >
      <span className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
        <span>{p.platform === "twitter_x" && premium ? "X Premium" : p.name}</span>
        <span className={cn("font-mono text-[12px] tabular-nums", over && "text-red-600 dark:text-red-400")}>
          {n.toLocaleString()}/{limit.toLocaleString()}
        </span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full", over ? "bg-red-500" : ratio > 0.9 ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </span>
    </Link>
  );
}

export default function PostPreviewToolPage() {
  const { platform: slug } = useParams();
  const p = PREVIEW_PLATFORMS.find((x) => x.slug === slug);
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [text, setText] = useState(readDraft);
  const [premium, setPremium] = useState(false);
  const textId = useId();
  const premiumId = useId();

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, text);
    } catch {
      // Storage blocked: the tool still works for this visit.
    }
  }, [text]);

  if (!p) return <Navigate to={postPreviewPath("linkedin")} replace />;

  const isX = p.platform === "twitter_x";
  const count = postCharCount(text, p.platform);
  const limit = limitFor(p, premium && isX);
  const post = () =>
    postEverywhere({ text, from: `post-preview/${p.slug}` }, !!session?.user, navigate, signInUrl);
  const siblings = PREVIEW_PLATFORMS.filter((x) => x.slug !== p.slug).slice(0, 4);

  return (
    <MarketingPageLayout signedIn={!!session?.user}>
      <SeoHead
        title={p.metaTitle}
        description={p.metaDescription}
        path={postPreviewPath(p.slug)}
        canonical={absoluteUrl(postPreviewPath(p.slug))}
        keywords={[`${p.name} character counter`, `${p.name} post preview`, `${p.name} character limit`]}
      />
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <nav className="text-[12px] text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Social0</Link> ›{" "}
          <Link href={FREE_TOOLS_PATH} className="hover:underline">Free tools</Link> › {p.name} post preview
        </nav>

        <ToolHero title={<>{p.name} Post Preview &amp; Character Counter</>} intro={p.intro} />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={textId} className="text-[14px] font-semibold">Your post</label>
              <span className={cn("font-mono text-[13px] tabular-nums", count > limit ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                {count.toLocaleString()} / {limit.toLocaleString()} · {(limit - count).toLocaleString()} left
              </span>
            </div>
            <textarea
              id={textId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-[15px] leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            />
            {isX ? (
              <label htmlFor={premiumId} className="flex cursor-pointer items-center gap-2 text-[14px]">
                <input id={premiumId} type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                My X account has Premium (25,000 characters, timeline shows the first 280)
              </label>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PREVIEW_PLATFORMS.map((x) => (
                <Meter key={x.slug} p={x} text={text} premium={premium && x.platform === "twitter_x"} active={x.slug === p.slug} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => { databullGoal("free_tool_cta", { tool: `post-preview/${p.slug}` }); void post(); }}
                className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2.5 text-[14px] font-bold text-emerald-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2"
              >
                Schedule this post free →
              </button>
              <span className="text-[13px] text-muted-foreground">Opens Social0 with this text as a draft. Post to {p.name} and 8 more networks.</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-muted/60 p-4 sm:p-5 lg:sticky lg:top-20">
            <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              {isX && premium ? "X Premium" : p.name} preview
            </span>
            <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2.5">
                <span className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-emerald-400 to-sky-500" aria-hidden />
                <span className="leading-tight">
                  <b className="block text-[14px]">Your Name</b>
                  <span className="text-[12px] text-muted-foreground">{isX || p.slug === "threads" || p.slug === "bluesky" ? "@yourhandle · now" : "Your headline · now"}</span>
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                <PreviewBody p={p} text={text} premium={premium && isX} />
              </p>
            </article>
            <p className="text-[12px] text-muted-foreground">Red text is past the limit. The grey link marks where the feed folds your post.</p>
          </div>
        </div>

        <section className="grid gap-8 md:grid-cols-3">
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">How to use it</h2>
            <ol className="list-decimal space-y-1 pl-5 text-[14px] text-muted-foreground">
              <li>Paste or write your post. It stays in this browser only.</li>
              <li>Pick a network to see its preview and where it gets cut.</li>
              <li>Fix anything in red, then schedule it.</li>
            </ol>
          </div>
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">{p.name} limits</h2>
            <ul className="list-disc space-y-1 pl-5 text-[14px] text-muted-foreground">
              {p.limits.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-serif text-[24px] font-bold">Other networks</h2>
            <div className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <Link key={s.slug} href={postPreviewPath(s.slug)} className="rounded-full border border-border px-3 py-1 text-[13px] hover:border-foreground/40">
                  {s.name} counter
                </Link>
              ))}
              <Link href={FREE_TOOLS_PATH} className="rounded-full border border-border px-3 py-1 text-[13px] hover:border-foreground/40">All free tools</Link>
            </div>
          </div>
        </section>

        <section className="max-w-[760px]">
          <h2 className="mb-3 font-serif text-[24px] font-bold">Tips for {p.name} posts</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-[14px] text-muted-foreground">
            {p.tips.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>

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
      </div>
    </MarketingPageLayout>
  );
}
