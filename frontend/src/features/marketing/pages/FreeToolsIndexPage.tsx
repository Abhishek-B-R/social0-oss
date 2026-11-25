import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { useSession } from "@/lib/auth-client";
import { absoluteUrl } from "@/lib/seo";
import { FREE_TOOLS_PATH, PREVIEW_PLATFORMS, postPreviewPath } from "@/lib/content/free-tools";
import { STANDALONE_TOOLS, freeToolPath } from "@/lib/content/free-tools-standalone";

export default function FreeToolsIndexPage() {
  const { data: session } = useSession();
  return (
    <MarketingPageLayout signedIn={!!session?.user}>
      <SeoHead
        title="Free Social Media Tools: Post Preview & Character Counters | Social0"
        description="Free, no-signup tools for social media posts: preview and character counters for LinkedIn, X (incl. Premium), Instagram, Threads, Bluesky, TikTok and more."
        path={FREE_TOOLS_PATH}
        canonical={absoluteUrl(FREE_TOOLS_PATH)}
      />
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 py-12 sm:px-6">
        <header className="flex flex-col gap-3 text-center">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Free · no signup</span>
          <h1 className="font-serif text-[clamp(30px,5vw,46px)] font-extrabold leading-tight text-balance text-[#333C4D] dark:text-white">
            Free social media tools
          </h1>
          <p className="mx-auto max-w-[56ch] text-[15px] text-muted-foreground">
            Small tools that do one job, free and without an account. When a post is ready, schedule it to all 9 networks with Social0.
          </p>
        </header>
        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Writing tools</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {STANDALONE_TOOLS.map((t) => (
              <Link
                key={t.slug}
                href={freeToolPath(t.slug)}
                className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 hover:border-emerald-500"
              >
                <span className="text-[15px] font-semibold">{t.name}</span>
                <span className="text-[13px] text-muted-foreground">{t.metaDescription.split(".")[0]}.</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Post preview &amp; character counter</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {PREVIEW_PLATFORMS.map((p) => (
              <Link
                key={p.slug}
                href={postPreviewPath(p.slug)}
                className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 hover:border-emerald-500"
              >
                <span className="text-[15px] font-semibold">{p.name} post preview</span>
                <span className="text-[13px] text-muted-foreground">{p.limits[0]}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </MarketingPageLayout>
  );
}
