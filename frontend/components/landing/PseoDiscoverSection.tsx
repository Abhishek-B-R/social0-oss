import Link from "next/link";

const featuredFeatures = [
  { href: "/features/threads-scheduler", label: "Threads scheduler" },
  { href: "/features/bluesky-scheduling-tool", label: "Bluesky scheduling" },
  { href: "/features/tiktok-scheduler", label: "TikTok scheduler" },
  { href: "/features/multi-platform-scheduler", label: "Multi-platform scheduler" },
];

const featuredAlternatives = [
  { href: "/alternatives/buffer", label: "Buffer alternative" },
  { href: "/alternatives/later", label: "Later alternative" },
  { href: "/alternatives/hootsuite", label: "Hootsuite alternative" },
];

export function PseoDiscoverSection() {
  return (
    <section className="border-t border-border bg-muted/20 px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <p className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700">
          Guides & comparisons
        </p>
        <h2 className="max-w-2xl font-serif text-[clamp(28px,4vw,40px)] leading-tight tracking-tight text-foreground">
          Scheduling guides for every platform
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Deep dives on Threads, Bluesky, TikTok, and more — plus honest
          comparisons if you&apos;re switching from Buffer, Later, or Hootsuite.
        </p>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              Platform schedulers
            </h3>
            <ul className="space-y-2">
              {featuredFeatures.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[15px] text-foreground underline-offset-4 hover:text-emerald-700 hover:underline dark:hover:text-emerald-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/features"
              className="mt-4 inline-block text-[13px] font-medium text-emerald-700 dark:text-emerald-400"
            >
              View all features →
            </Link>
          </div>

          <div>
            <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              Scheduler alternatives
            </h3>
            <ul className="space-y-2">
              {featuredAlternatives.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[15px] text-foreground underline-offset-4 hover:text-emerald-700 hover:underline dark:hover:text-emerald-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/alternatives"
              className="mt-4 inline-block text-[13px] font-medium text-emerald-700 dark:text-emerald-400"
            >
              View all comparisons →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
