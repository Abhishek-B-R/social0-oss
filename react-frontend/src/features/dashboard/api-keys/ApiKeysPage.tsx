import DocsInfoIcon from "@/components/info-icon";
import { DOCS_API_KEYS_URL } from "@/lib/docs-url";

export default function ApiKeysPage() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
          API Keys (v2)
        </h1>
        <DocsInfoIcon url={DOCS_API_KEYS_URL} />
      </div>
      <p className="mt-2 text-text-muted">
        Create and manage API keys for programmatic access. This is for v2 of
        the API.
      </p>
      <div className="mt-8 rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <p className="text-sm text-text-muted">
          API keys management coming soon.
        </p>
      </div>
    </div>
  );
}
