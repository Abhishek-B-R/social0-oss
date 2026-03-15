import { DOCS_API_KEYS_URL } from "@/lib/docs-url";
import { MdQuestionMark } from "react-icons/md";

export default function ApiKeysPage() {
  return (
    <div>
      <a
        href={DOCS_API_KEYS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <MdQuestionMark className="h-4 w-4" />
      </a>
      <h1 className="text-2xl font-extrabold text-text">API Keys (v2)</h1>
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
