import { useEffect, useId, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { absoluteUrl } from "@/lib/seo";
import { databullGoal } from "@/lib/databull";
import { postEverywhere } from "@/lib/tool-handoff";
import {
  cardDescription, cardImage, cardTitle, checkPreview, unsafeUrl, type Check, type ImageInfo, type PreviewMeta,
} from "@/lib/link-preview";
import { FREE_TOOLS_PATH, postPreviewPath } from "@/lib/content/free-tools";
import { LINK_PREVIEW as T, freeToolPath } from "@/lib/content/free-tools-standalone";
import { cn } from "@/lib/utils";

type Result = { meta: PreviewMeta; image: ImageInfo };
const EXAMPLE = "https://social0.app";

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

function Card({ net, children }: { net: string; children: ReactNode }) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{net}</figcaption>
      <div className="overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </figure>
  );
}

function Img({ src, ratio = "1.91 / 1" }: { src?: string; ratio?: string }) {
  if (!src) return <div className="flex items-center justify-center bg-muted text-[12px] text-muted-foreground" style={{ aspectRatio: ratio }}>No image</div>;
  return <img src={src} alt="" referrerPolicy="no-referrer" className="block w-full bg-muted object-cover" style={{ aspectRatio: ratio }} />;
}

function Previews({ m }: { m: PreviewMeta }) {
  const title = cardTitle(m);
  const desc = cardDescription(m);
  const domain = host(m.url);
  const xLarge = (m.twitterCard ?? "summary_large_image") === "summary_large_image" && !!cardImage(m, "x");
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Card net="X (Twitter)">
        {xLarge ? (
          <div className="relative">
            <Img src={cardImage(m, "x")} />
            <span className="absolute bottom-2 left-2 max-w-[85%] truncate rounded bg-black/70 px-1.5 py-0.5 text-[12px] text-white">{title}</span>
          </div>
        ) : (
          <div className="flex">
            <div className="w-28 shrink-0"><Img src={cardImage(m, "x")} ratio="1 / 1" /></div>
            <div className="min-w-0 p-2.5 text-[13px]"><span className="text-muted-foreground">{domain}</span><p className="line-clamp-2 font-medium">{title}</p></div>
          </div>
        )}
        <p className="px-3 py-1.5 text-[12px] text-muted-foreground">From {domain}</p>
      </Card>
      <Card net="LinkedIn">
        <Img src={cardImage(m)} />
        <div className="p-3"><p className="line-clamp-2 text-[14px] font-semibold">{title}</p><p className="text-[12px] text-muted-foreground">{domain}</p></div>
      </Card>
      <Card net="Facebook">
        <Img src={cardImage(m)} />
        <div className="bg-muted/50 p-3">
          <p className="text-[11px] uppercase text-muted-foreground">{domain}</p>
          <p className="line-clamp-2 text-[15px] font-semibold">{title}</p>
          {desc ? <p className="line-clamp-1 text-[13px] text-muted-foreground">{desc}</p> : null}
        </div>
      </Card>
      <Card net="Bluesky">
        <Img src={cardImage(m)} />
        <div className="p-3">
          <p className="line-clamp-2 text-[14px] font-semibold">{title}</p>
          {desc ? <p className="line-clamp-2 text-[13px] text-muted-foreground">{desc}</p> : null}
          <p className="mt-1 border-t border-border pt-1 text-[12px] text-muted-foreground">🌐 {domain}</p>
        </div>
      </Card>
      <Card net="Threads">
        <Img src={cardImage(m)} />
        <div className="p-3"><p className="text-[12px] text-muted-foreground">{domain}</p><p className="line-clamp-2 text-[14px] font-semibold">{title}</p></div>
      </Card>
    </div>
  );
}

const ICON: Record<Check["level"], string> = { ok: "✓", warn: "!", error: "✕" };
const TONE: Record<Check["level"], string> = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  error: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export default function LinkPreviewCheckerPage() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("url") ?? EXAMPLE);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputId = useId();

  const check = async (raw: string) => {
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    const bad = unsafeUrl(url);
    if (bad) {
      setError(bad);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/tools-api/link-preview?url=${encodeURIComponent(url)}`);
      const body = (await res.json()) as Result & { error?: string };
      if (body.error) {
        setError(body.error);
        setResult(null);
      } else setResult(body);
      if (url !== EXAMPLE) setParams({ url }, { replace: true });
    } catch {
      setError("Couldn't reach the checker. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Check the example (or ?url=) once on load; later checks come from the form.
  const [initialUrl] = useState(() => params.get("url") ?? EXAMPLE);
  useEffect(() => {
    const t = window.setTimeout(() => void check(initialUrl), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `check` is recreated every render; run once.
  }, [initialUrl]);

  const onSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    databullGoal("free_tool_use", { tool: T.slug });
    void check(input);
  };

  const checks = result ? checkPreview(result.meta, result.image) : [];
  const counts = { error: checks.filter((c) => c.level === "error").length, warn: checks.filter((c) => c.level === "warn").length };
  const tags: [string, string | undefined][] = result
    ? [
        ["og:title", result.meta.title], ["og:description", result.meta.description], ["og:image", result.meta.image],
        ["og:image:alt", result.meta.imageAlt], ["og:site_name", result.meta.siteName], ["og:type", result.meta.type],
        ["twitter:card", result.meta.twitterCard], ["twitter:image", result.meta.twitterImage], ["<title>", result.meta.htmlTitle],
        ["meta description", result.meta.metaDescription], ["canonical", result.meta.canonical],
      ]
    : [];
  const path = freeToolPath(T.slug);

  return (
    <MarketingPageLayout signedIn={!!session?.user}>
      <SeoHead title={T.metaTitle} description={T.metaDescription} path={path} canonical={absoluteUrl(path)}
        keywords={["link preview checker", "open graph checker", "og image checker", "linkedin post inspector", "twitter card validator"]} />
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <nav className="text-[12px] text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">Social0</Link> ›{" "}
          <Link href={FREE_TOOLS_PATH} className="hover:underline">Free tools</Link> › {T.name}
        </nav>

        <header className="flex flex-col items-center gap-3 text-center">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Free tool · no signup</span>
          <h1 className="font-serif text-[clamp(30px,5vw,48px)] font-extrabold leading-tight tracking-tight text-balance text-[#333C4D] dark:text-white">{T.name}</h1>
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">{T.intro}</p>
        </header>

        <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-[760px] flex-col gap-2 sm:flex-row">
          <label htmlFor={inputId} className="sr-only">Link to check</label>
          <input id={inputId} type="text" inputMode="url" value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://yoursite.com/page"
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50" />
          <button type="submit" disabled={loading}
            className="rounded-xl bg-emerald-500 px-5 py-3 text-[15px] font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2">
            {loading ? "Checking…" : "Check preview"}
          </button>
        </form>
        {error ? <p role="alert" className="mx-auto max-w-[760px] text-center text-[14px] text-red-600 dark:text-red-400">{error}</p> : null}

        {result ? (
          <>
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[18px] font-semibold">
                  Cards for <span className="font-mono text-[15px]">{host(result.meta.url)}</span>
                </h2>
                <span className="text-[13px] text-muted-foreground">
                  {counts.error ? `${counts.error} to fix` : "Nothing broken"}{counts.warn ? ` · ${counts.warn} to improve` : ""}
                  {result.image?.width ? ` · image ${result.image.width} x ${result.image.height}` : ""}
                </span>
              </div>
              <Previews m={result.meta} />
              <p className="text-[12px] text-muted-foreground">Close approximations of each network's card; exact styling changes often.</p>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h2 className="font-serif text-[24px] font-bold">What to fix</h2>
                <ul className="flex flex-col gap-1.5">
                  {checks.map((c) => (
                    <li key={c.text} className="flex items-start gap-2 text-[14px]">
                      <span className={cn("mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", TONE[c.level])} aria-label={c.level}>{ICON[c.level]}</span>
                      <span>{c.text}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => { databullGoal("free_tool_cta", { tool: T.slug }); void postEverywhere({ text: result.meta.url, from: T.slug }, !!session?.user, navigate, signInUrl); }}
                  className="mt-2 w-fit rounded-lg border border-border px-4 py-2.5 text-[14px] font-semibold hover:border-emerald-500">
                  Schedule a post with this link →
                </button>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <h2 className="font-serif text-[24px] font-bold">Tags found</h2>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-[13px]">
                    <tbody>
                      {tags.map(([k, v]) => (
                        <tr key={k} className="border-b border-border last:border-0">
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono text-muted-foreground">{k}</td>
                          <td className="break-all px-3 py-1.5">{v ?? <span className="text-red-600 dark:text-red-400">missing</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        ) : null}

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
              {[[postPreviewPath("linkedin"), "LinkedIn post preview"], [postPreviewPath("x"), "X character counter"], ["/free-tools/image-resizer", "Image resizer (1200 x 630)"]].map(([href, label]) => (
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
