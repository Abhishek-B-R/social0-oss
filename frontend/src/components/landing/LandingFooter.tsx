import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { DOCS_API_URL, DOCS_CLI_URL } from "@/lib/docs-url";

const footerLinks = [
  { href: "/features", label: "Features" },
  { href: DOCS_API_URL, label: "API", external: true },
  { href: DOCS_CLI_URL, label: "CLI", external: true },
  { href: "/mcp", label: "MCP" },
  { href: "/alternatives", label: "Alternatives" },
  { href: "/#stories", label: "Stories" },
  { href: "/#platforms", label: "Platforms" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund", label: "Refunds" },
  { href: "/data-deletion", label: "Data deletion" },
];

/** On /home, same-page anchors must use /home#… so they don't hit / and redirect logged-in users. */
function landingNavHref(href: string, pathname: string | null) {
  if (pathname === "/home" && href.startsWith("/#")) {
    return `/home${href.slice(1)}`;
  }
  return href;
}

export function LandingFooter() {
  const pathname = useLocation().pathname;
  const homeHref = pathname === "/home" ? "/home" : "/";

  return (
    <footer className="relative overflow-hidden border-t border-border bg-muted/40 dark:bg-[#111111]">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-12 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Link
            href={homeHref}
            className="font-serif text-xl tracking-tight text-foreground"
          >
            Social0
          </Link>

          <nav className="flex flex-wrap gap-6 md:gap-8">
            {footerLinks.map((link) =>
              "external" in link && link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={landingNavHref(link.href, pathname)}
                  className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        <p className="text-center text-[12px] text-muted-foreground">
          © 2026 Social0 · Built by{" "}
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

      {/* Huge brand watermark — below footer links, site-style serif + emerald hush */}
      <div
        className="pointer-events-none select-none overflow-hidden px-2 pb-2 pt-4 sm:pb-3 sm:pt-6"
        aria-hidden
      >
        <p className="mx-auto max-w-[100vw] truncate text-center font-serif text-[clamp(4.5rem,18vw,14rem)] font-medium leading-none tracking-[-0.04em] text-foreground/[0.06] dark:text-white/[0.055]">
          Social0
        </p>
      </div>
    </footer>
  );
}
