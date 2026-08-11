import Link from "@/components/AppLink";
import {
  DOCS_API_QUICKSTART_URL,
  DOCS_CLI_QUICKSTART_URL,
} from "@/lib/docs-url";
import { ArrowRight } from "lucide-react";

export function DevelopersSection() {
  return (
    <section id="developers" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-[1120px]">
        {/* Match Who/How glassy double-shell — not a flat doc panel */}
        <div className="rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
          <div className="rounded-[22px] border border-border/60 bg-background p-8 dark:border-white/5 dark:bg-[#111111] md:p-10 lg:p-12">
            <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16">
              <div>
                <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
                  Developers
                </p>
                <h2 className="font-serif text-[clamp(24px,3vw,36px)] leading-tight tracking-tight text-[#333C4D] dark:text-white">
                  Build your own social publishing workflows on top of Social0.
                </h2>
                <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                  REST API with webhooks, MCP for AI agents, and an official CLI.
                  Build your own social publishing workflows while Social0
                  handles the platform integrations.
                </p>
                <p className="mt-5 flex flex-wrap gap-2">
                  <code className="inline-block rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-[12px] text-muted-foreground dark:border-white/10 dark:bg-[#151515]">
                    npm install -g social0
                  </code>
                  <code className="inline-block rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-[12px] text-muted-foreground dark:border-white/10 dark:bg-[#151515]">
                    api.social0.app/docs
                  </code>
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                <a
                  href={DOCS_CLI_QUICKSTART_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-[14px] font-medium text-foreground transition-colors hover:bg-muted dark:border-white/10 dark:bg-[#151515] dark:hover:bg-white/5"
                >
                  CLI docs
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </a>
                <a
                  href={DOCS_API_QUICKSTART_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-[14px] font-medium text-foreground transition-colors hover:bg-muted dark:border-white/10 dark:bg-[#151515] dark:hover:bg-white/5"
                >
                  REST API docs
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </a>
                <Link
                  href="/mcp"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-[14px] font-medium text-foreground transition-colors hover:bg-muted dark:border-white/10 dark:bg-[#151515] dark:hover:bg-white/5"
                >
                  MCP for AI
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
