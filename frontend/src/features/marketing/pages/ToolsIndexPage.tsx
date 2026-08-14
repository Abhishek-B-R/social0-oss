import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { TOOLS } from "@/lib/content/tools";
import {
  absoluteUrl,
  buildItemListJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebPageJsonLd,
} from "@/lib/seo";

const TITLE = "Tools & Integrations | Social0";
const DESCRIPTION =
  "API, MCP, CLI, bulk tools, calendar, queue, teams, and agent integrations for multi-platform social publishing.";

export default function ToolsIndexPage() {
  const jsonLd = [
    buildWebPageJsonLd({
      name: TITLE,
      description: DESCRIPTION,
      path: "/tools",
    }),
    buildItemListJsonLd(
      TOOLS.map((tool) => ({
        name: tool.label,
        path: `/tools/${tool.slug}`,
      })),
    ),
    buildSoftwareApplicationJsonLd(),
  ];

  return (
    <MarketingPageLayout>
      <SeoHead
        title={TITLE}
        description={DESCRIPTION}
        path="/tools"
        canonical={absoluteUrl("/tools")}
      />
      <PseoJsonLd graphs={jsonLd} />
      <section className="px-6 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1100px]">
          <p className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700">
            Tools
          </p>
          <h1 className="max-w-2xl font-serif text-[clamp(32px,5vw,48px)] leading-tight tracking-tight text-[#333C4D] dark:text-white">
            Everything that plugs into Social0
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
            Developer surfaces, growth automation, and agent hosts — same publish
            pipeline as the dashboard.
          </p>

          <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => (
              <li key={tool.slug}>
                <Link
                  href={`/tools/${tool.slug}`}
                  className="flex h-full flex-col rounded-2xl border border-border bg-background px-5 py-5 transition-colors hover:border-emerald-600/40 hover:bg-muted/30 dark:hover:bg-white/[0.03]"
                >
                  <span className="text-[15px] font-semibold text-[#333C4D] dark:text-white">
                    {tool.label}
                  </span>
                  <span className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                    {tool.heroSubheadline}
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/mcp"
                className="flex h-full flex-col rounded-2xl border border-border bg-background px-5 py-5 transition-colors hover:border-emerald-600/40 hover:bg-muted/30 dark:hover:bg-white/[0.03]"
              >
                <span className="text-[15px] font-semibold text-[#333C4D] dark:text-white">
                  MCP
                </span>
                <span className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                  Full hosted MCP setup for ChatGPT, Claude, Cursor, and more.
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </MarketingPageLayout>
  );
}
