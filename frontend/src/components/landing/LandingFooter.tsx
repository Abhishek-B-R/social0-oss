import { useState } from "react";
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from "@/components/landing/PlatformIcons";
import { DOCS_BASE_URL } from "@/lib/docs-url";
import { ALTERNATIVES } from "@/lib/content/alternatives";
import { FEATURES } from "@/lib/content/features";
import { cn } from "@/lib/utils";

type FooterLink = {
  href: string;
  label: string;
  external?: boolean;
};

const socialLinks = [
  // ponytail: self-host repo private - uncomment block below when re-opened
  // {
  //   href: "https://github.com/abhishek-b-r/social0-selfhost",
  //   label: "GitHub",
  //   Icon: GitHubIcon,
  // },
  {
    href: "https://github.com/Abhishek-B-R/social0-cli",
    label: "GitHub",
    Icon: GitHubIcon,
  },
  {
    href: "https://www.linkedin.com/company/social0/",
    label: "LinkedIn",
    Icon: LinkedInIcon,
  },
  {
    href: "https://x.com/social0_app",
    label: "X",
    Icon: XIcon,
  },
  {
    href: "https://www.instagram.com/social0_app",
    label: "Instagram",
    Icon: InstagramIcon,
  },
  {
    href: "https://www.facebook.com/1094201727120312/",
    label: "Facebook",
    Icon: FacebookIcon,
  },
  {
    href: "https://www.youtube.com/@social0-app",
    label: "YouTube",
    Icon: YouTubeIcon,
  },
  {
    href: "https://www.tiktok.com/@social0_",
    label: "TikTok",
    Icon: TikTokIcon,
  },
] as const;

const PLATFORM_LABELS: Record<string, string> = {
  "instagram-scheduler": "Instagram",
  "facebook-scheduler": "Facebook",
  "youtube-scheduler": "YouTube",
  "tiktok-scheduler": "TikTok",
  "twitter-scheduler": "X (Twitter)",
  "linkedin-scheduler": "LinkedIn",
  "threads-scheduler": "Threads",
  "pinterest-scheduler": "Pinterest",
  "bluesky-scheduling-tool": "Bluesky",
  "multi-platform-scheduler": "All platforms",
  "social-media-calendar": "Content calendar",
};

/** On /home, same-page anchors must use /home#id so they don't hit / and redirect logged-in users. */
function landingNavHref(href: string, pathname: string | null) {
  if (pathname === "/home" && href.startsWith("/#")) {
    return `/home${href.slice(1)}`;
  }
  return href;
}

function GitHubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.333-1.754-1.333-1.754-1.089-.745.084-.729.084-.729 1.205.084 1.84 1.236 1.84 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function FooterNavLink({
  link,
  pathname,
}: {
  link: FooterLink;
  pathname: string;
}) {
  const className =
    "text-[13px] text-muted-foreground transition-colors hover:text-foreground";
  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {link.label}
      </a>
    );
  }
  return (
    <Link href={landingNavHref(link.href, pathname)} className={className}>
      {link.label}
    </Link>
  );
}

const COMPARE_FOOTER_LIMIT = 8;

/** High-intent competitors shown first in the footer Compare column. */
const COMPARE_FOOTER_PRIORITY = [
  "buffer",
  "hootsuite",
  "later",
  "sprout-social",
  "metricool",
  "postiz",
  "postsyncer",
  "blotato",
  "mixpost",
  "planable",
  "socialbee",
  "typefully",
  "taplio",
  "publer",
  "agorapulse",
  "socialpilot",
  "sendible",
  "postbridge",
  "tailwind",
  "coschedule",
  "loomly",
];

function sortCompareLinks(links: FooterLink[]): FooterLink[] {
  const rank = new Map(
    COMPARE_FOOTER_PRIORITY.map((slug, i) => [`/alternatives/${slug}`, i]),
  );
  return [...links].sort(
    (a, b) => (rank.get(a.href) ?? 999) - (rank.get(b.href) ?? 999),
  );
}

function FooterCompareColumn({
  links,
  pathname,
}: {
  links: FooterLink[];
  pathname: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = sortCompareLinks(links);
  const hasMore = sorted.length > COMPARE_FOOTER_LIMIT;
  const visible = expanded ? sorted : sorted.slice(0, COMPARE_FOOTER_LIMIT);
  const hiddenCount = sorted.length - COMPARE_FOOTER_LIMIT;

  return (
    <div>
      <p className="mb-4 text-[14px] font-semibold text-foreground">Compare</p>
      <ul className="flex flex-col gap-2.5">
        {visible.map((link) => (
          <li key={`compare-${link.href}`}>
            <FooterNavLink link={link} pathname={pathname} />
          </li>
        ))}
      </ul>
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : `View more (${hiddenCount})`}
        </button>
      ) : null}
    </div>
  );
}

function FooterColumn({
  title,
  links,
  pathname,
}: {
  title: string;
  links: FooterLink[];
  pathname: string;
}) {
  return (
    <div>
      <p className="mb-4 text-[14px] font-semibold text-foreground">{title}</p>
      <ul className="flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={`${title}-${link.href}-${link.label}`}>
            <FooterNavLink link={link} pathname={pathname} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  const pathname = useLocation().pathname;
  const homeHref = pathname === "/home" ? "/home" : "/";

  const platformLinks: FooterLink[] = FEATURES.map((f) => ({
    href: `/features/${f.slug}`,
    label: f.platformLabel ?? PLATFORM_LABELS[f.slug] ?? f.slug,
  }));

  const compareLinks: FooterLink[] = ALTERNATIVES.map((a) => ({
    href: `/alternatives/${a.slug}`,
    label: `${a.competitorName} alternative`,
  }));

  const toolLinks: FooterLink[] = [
    { href: "/tools/api", label: "API" },
    { href: "/mcp", label: "MCP" },
    { href: "/tools/cli", label: "AI Agents CLI" },
    { href: "/tools/webhooks", label: "Webhooks" },
    { href: "/tools/bulk-image", label: "Bulk image tools" },
    { href: "/tools/bulk-video", label: "Bulk video tools" },
    { href: "/tools/auto-repost", label: "Auto-repost" },
    { href: "/tools/auto-plug", label: "Auto-plug" },
    { href: "/tools/calendar", label: "Content calendar" },
    { href: "/tools/queue", label: "Posting queue" },
    { href: "/tools/chatgpt", label: "ChatGPT MCP" },
    { href: "/tools/claude", label: "Claude MCP" },
    { href: "/tools/cursor", label: "Cursor MCP" },
    { href: "/tools/openclaw", label: "OpenClaw skill" },
    // ponytail: self-host hidden while repo private
    // { href: "/tools/self-host", label: "Self-host" },
    { href: "/tools/teams", label: "Teams" },
  ];

  const resourceLinks: FooterLink[] = [
    { href: "/tools", label: "All tools" },
    { href: "/features", label: "All features" },
    { href: "/alternatives", label: "All comparisons" },
    { href: DOCS_BASE_URL, label: "Docs", external: true },
    { href: "/#platforms", label: "Channels" },
    { href: "/#stories", label: "Stories" },
    { href: "/#faq", label: "FAQ" },
    { href: "/#developers", label: "Developers" },
    // ponytail: self-host repo private
    // { href: "https://github.com/abhishek-b-r/social0-selfhost", label: "GitHub", external: true },
    { href: "https://github.com/Abhishek-B-R/social0-cli", label: "GitHub", external: true },
  ];

  const companyLinks: FooterLink[] = [
    { href: "/pricing", label: "Pricing" },
    { href: "/terms", label: "Terms of service" },
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/refund", label: "Refunds" },
    { href: "/data-deletion", label: "Data deletion" },
  ];

  return (
    <footer className="relative overflow-hidden border-t border-border bg-muted/40 dark:bg-[#111111]">
      <div className="mx-auto max-w-[1180px] px-6 py-14 lg:px-8 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-16">
          <div className="max-w-md">
            <Link
              href={homeHref}
              className="inline-flex items-center gap-3 font-logo text-2xl font-normal tracking-tight text-foreground sm:text-[1.75rem]"
            >
              <span className="relative block size-9 shrink-0">
                <img
                  src="/logo-circular.webp"
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 rounded-full dark:hidden"
                />
                <img
                  src="/logo-dark.webp"
                  alt=""
                  width={36}
                  height={36}
                  className="absolute inset-0 hidden size-9 rounded-full border border-white/20 dark:block"
                />
              </span>
              Social0
            </Link>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              Multi-platform social scheduling - for humans and AI agents.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {socialLinks.map(({ href, label, Icon }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground",
                      "transition-colors hover:border-emerald-600/40 hover:text-foreground dark:bg-[#151515]",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <FooterColumn title="Platforms" links={platformLinks} pathname={pathname} />
            <FooterCompareColumn links={compareLinks} pathname={pathname} />
            <FooterColumn title="Tools" links={toolLinks} pathname={pathname} />
            <FooterColumn title="Resources" links={resourceLinks} pathname={pathname} />
            <FooterColumn title="Company" links={companyLinks} pathname={pathname} />
          </div>
        </div>

        <p className="mt-14 text-[12px] text-muted-foreground">
          Social0 · Built by{" "}
          <a
            href="https://x.com/abhitwt"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            @abhitwt
          </a>
        </p>
      </div>
    </footer>
  );
}
