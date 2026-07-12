import Link from "@/components/AppLink";
import { DOCS_API_QUICKSTART_URL } from "@/lib/docs-url";
import { ArrowRight } from "lucide-react";

export function DevelopersSection() {
  return (
    <section id="developers" className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <div className="rounded-2xl border border-border bg-muted/20 p-8 dark:bg-muted/10 md:p-10 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16">
            <div>
              <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
                Developers
              </p>
              <h2 className="font-serif text-[clamp(24px,3vw,36px)] leading-tight tracking-tight text-foreground">
                Automate from your stack
              </h2>
              <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                REST API with webhooks, plus an MCP server for Claude, Cursor,
                and VS Code. Same publish pipeline as the dashboard.
              </p>
              <p className="mt-5">
                <code className="inline-block rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[12px] text-muted-foreground dark:bg-background/80">
                  api.social0.app/v1
                </code>
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <a
                href={DOCS_API_QUICKSTART_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-[14px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                REST API docs
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </a>
              <Link
                href="/mcp"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-[14px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                MCP for AI
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
