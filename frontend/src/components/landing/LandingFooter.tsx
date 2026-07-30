import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { DOCS_API_URL, DOCS_CLI_URL } from "@/lib/docs-url";

const footerLinks = [
  { href: "/features", label: "Features" },
  { href: DOCS_API_URL, label: "API", external: true },
  { href: DOCS_CLI_URL, label: "CLI", external: true },
  { href: "/mcp", label: "MCP" },
  { href: "/alternatives", label: "Alternatives" },
  { href: "/#platforms", label: "Platforms" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund", label: "Refunds" },
  { href: "/data-deletion", label: "Data deletion" },
];

export function LandingFooter() {
  const pathname = useLocation().pathname;
  const homeHref = pathname === "/home" ? "/home" : "/";

  return (
    <footer className="border-t border-white/5 bg-[#111111] py-12">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Link
            href={homeHref}
            className="font-serif text-xl tracking-tight text-white"
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
    </footer>
  );
}
