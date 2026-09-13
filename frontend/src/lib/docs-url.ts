import { getDocsUrl } from "./env";

/**
 * Links into the Social0 docs site. Set VITE_DOCS_URL in .env
 * (e.g. https://docs.social0.app).
 *
 * Only the pages the SPA actually links to live here — a constant per docs page
 * that nothing links to is a stale URL nobody notices when the docs move.
 */
export const DOCS_BASE_URL = getDocsUrl();

const docs = (path: string): string => `${DOCS_BASE_URL}/docs/${path}`;

// ─── Dashboard ──────────────────────────────────────────────────────────────

export const DOCS_DASHBOARD_URL = docs("dashboard");
export const DOCS_CONNECTIONS_URL = docs("dashboard/connections");
export const DOCS_BULK_TOOLS_IMAGE_URL = docs("dashboard/bulk-tools/image");
export const DOCS_BULK_TOOLS_VIDEO_URL = docs("dashboard/bulk-tools/video");

// ─── Public REST API ────────────────────────────────────────────────────────

export const DOCS_API_URL = docs("api");
export const DOCS_API_QUICKSTART_URL = docs("api/quickstart");
export const DOCS_API_WEBHOOKS_URL = docs("api/webhooks");
export const DOCS_API_OPENAPI_URL = docs("api/openapi");

// ─── Integrations (CLI + MCP) ───────────────────────────────────────────────

export const DOCS_CLI_URL = docs("integrations/cli");
export const DOCS_CLI_QUICKSTART_URL = docs("integrations/cli/quickstart");
export const DOCS_MCP_URL = docs("integrations/mcp");
export const DOCS_MCP_QUICKSTART_URL = docs("integrations/mcp/quickstart");

// ─── Onboarding ─────────────────────────────────────────────────────────────

export const DOCS_ONBOARDING_URL = docs("onboarding");
export const DOCS_ONBOARDING_GOAL_URL = docs("onboarding/step2");
export const DOCS_ONBOARDING_CONNECT_URL = docs("onboarding/step3");
export const DOCS_ONBOARDING_COMPLETE_URL = docs("onboarding/step4");

// ─── Legal ──────────────────────────────────────────────────────────────────

export const DOCS_PRIVACY_URL = docs("privacy");
export const DOCS_TERMS_URL = docs("terms");
