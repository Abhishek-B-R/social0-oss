import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import {
  DOCS_API_OPENAPI_URL,
  DOCS_API_URL,
  DOCS_BASE_URL,
} from "@/lib/docs-url";

const linkClass =
  "text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400 dark:hover:text-emerald-300";

export default function DevelopersPage() {
  return (
    <div className="landing landing-page min-h-screen flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[22px] text-foreground landing mb-6">
          Social0 developer resources
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          REST API, OpenAPI, MCP, CLI, webhooks, and API keys
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Start here
            </h2>
            <p>
              Social0 developer access is self-serve. Create a free account,
              connect social networks, then mint an API key at{" "}
              <a href="/dashboard/api-keys" className={linkClass}>
                /dashboard/api-keys
              </a>
              . Keys start with <code>sk_live_</code>. There is no sales form
              for the public API. A sandbox is the free tier plus unpublished
              drafts; live publishes go to real networks.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              REST API and OpenAPI
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                OpenAPI 3.1:{" "}
                <a href="https://api.social0.app/openapi.json" className={linkClass}>
                  https://api.social0.app/openapi.json
                </a>
              </li>
              <li>
                Docs:{" "}
                <a href={DOCS_API_URL} className={linkClass}>
                  {DOCS_API_URL}
                </a>{" "}
                and{" "}
                <a href={DOCS_API_OPENAPI_URL} className={linkClass}>
                  {DOCS_API_OPENAPI_URL}
                </a>
              </li>
              <li>
                Versioning and sunset policy:{" "}
                <a href="/api-versioning.md" className={linkClass}>
                  /api-versioning.md
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              MCP, CLI, and webhooks
            </h2>
            <p>
              Hosted MCP (Streamable HTTP + OAuth):{" "}
              <a href="https://mcp.social0.app" className={linkClass}>
                https://mcp.social0.app
              </a>
              . npm package <code>@social0/mcp</code>. CLI{" "}
              <code>npm i -g social0</code>. Product pages:{" "}
              <a href="/mcp" className={linkClass}>
                /mcp
              </a>
              ,{" "}
              <a href="/tools/cli" className={linkClass}>
                /tools/cli
              </a>
              ,{" "}
              <a href="/tools/api" className={linkClass}>
                /tools/api
              </a>
              . Docs hub:{" "}
              <a href={DOCS_BASE_URL} className={linkClass}>
                {DOCS_BASE_URL}
              </a>
              . Agent index:{" "}
              <a href="/llms.txt" className={linkClass}>
                /llms.txt
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
