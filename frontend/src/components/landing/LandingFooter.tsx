
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { DOCS_API_URL } from "@/lib/docs-url";

const footerLinks = [
  { href: "/features", label: "Features" },
  { href: DOCS_API_URL, label: "API", external: true },
  { href: "/mcp", label: "MCP" },
  { href: "/alternatives", label: "Alternatives" },
  { href: "/#platforms", label: "Platforms" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function LandingFooter() {
  const pathname = useLocation().pathname;
  const homeHref = pathname === "/home" ? "/home" : "/";

  return (
    <footer className="border-t border-border bg-background py-12 dark:bg-background/50">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-6 px-6 lg:px-8">
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
                href={link.href}
                className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>

        <span className="text-[12px] text-muted-foreground">
          © 2026 Social0 · Built by{" "}
          <a
            href="https://x.com/abhitwt"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            @abhitwt
          </a>
        </span>
      </div>
    </footer>
  );
}
