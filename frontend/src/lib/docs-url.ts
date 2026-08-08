import { getDocsUrl } from "./env";

/**
 * Base URL for the Social0 docs site. Used for links to fair usage, billing, dashboard pages, etc.
 * Set VITE_DOCS_URL in .env (e.g. https://docs.social0.app).
 */
export const DOCS_BASE_URL = getDocsUrl();

// ─── Billing & plans ───────────────────────────────────────────────────────

/** Fair usage policy (platform posting guidelines). */
export const DOCS_FAIR_USAGE_URL = `${DOCS_BASE_URL}/docs/billing/fair-usage`;

/** Billing (dashboard). */
export const DOCS_BILLING_URL = `${DOCS_BASE_URL}/docs/dashboard/billing`;

// ─── Dashboard (main) ───────────────────────────────────────────────────────

/** Dashboard overview. */
export const DOCS_DASHBOARD_URL = `${DOCS_BASE_URL}/docs/dashboard`;

/** Composer. */
export const DOCS_COMPOSER_URL = `${DOCS_BASE_URL}/docs/dashboard/composer`;

/** Manual setup / create type. */
export const DOCS_CREATE_TYPE_URL = `${DOCS_BASE_URL}/docs/dashboard/create-type`;

/** Connections. */
export const DOCS_CONNECTIONS_URL = `${DOCS_BASE_URL}/docs/dashboard/connections`;

/** Settings. */
export const DOCS_SETTINGS_URL = `${DOCS_BASE_URL}/docs/dashboard/settings`;

/** Queue (in settings). */
export const DOCS_QUEUE_URL = `${DOCS_BASE_URL}/docs/dashboard/queue`;

/** More (mobile menu). */
export const DOCS_MORE_URL = `${DOCS_BASE_URL}/docs/dashboard/more`;

/** Calendar. */
export const DOCS_CALENDAR_URL = `${DOCS_BASE_URL}/docs/dashboard/calendar`;

/** Feedback. */
export const DOCS_FEEDBACK_URL = `${DOCS_BASE_URL}/docs/dashboard/feedback`;

/** Teams. */
export const DOCS_TEAMS_URL = `${DOCS_BASE_URL}/docs/dashboard/teams`;

/** API keys & Developer portal (dashboard guide). */
export const DOCS_API_KEYS_URL = `${DOCS_BASE_URL}/docs/dashboard/api-keys`;

// ─── Public REST API (docs.social0.app/docs/api) ─────────────────────────────

/** API overview. */
export const DOCS_API_URL = `${DOCS_BASE_URL}/docs/api`;

/** 5-minute API quickstart. */
export const DOCS_API_QUICKSTART_URL = `${DOCS_BASE_URL}/docs/api/quickstart`;

/** API authentication (Bearer keys). */
export const DOCS_API_AUTH_URL = `${DOCS_BASE_URL}/docs/api/authentication`;

/** Webhooks — events, signing, verification. */
export const DOCS_API_WEBHOOKS_URL = `${DOCS_BASE_URL}/docs/api/webhooks`;

/** Webhooks API reference (manage subscriptions). */
export const DOCS_API_REFERENCE_WEBHOOKS_URL = `${DOCS_BASE_URL}/docs/api/reference/webhooks`;

/** OpenAPI spec & SDKs. */
export const DOCS_API_OPENAPI_URL = `${DOCS_BASE_URL}/docs/api/openapi`;

/** @deprecated Use DOCS_API_URL */
export const DOCS_REST_API_URL = DOCS_API_URL;

// ─── Integrations (CLI + MCP) ────────────────────────────────────────────────

/** CLI overview. */
export const DOCS_CLI_URL = `${DOCS_BASE_URL}/docs/integrations/cli`;

/** CLI quick start. */
export const DOCS_CLI_QUICKSTART_URL = `${DOCS_BASE_URL}/docs/integrations/cli/quickstart`;

/** CLI commands reference. */
export const DOCS_CLI_COMMANDS_URL = `${DOCS_BASE_URL}/docs/integrations/cli/commands`;

/** MCP server overview. */
export const DOCS_MCP_URL = `${DOCS_BASE_URL}/docs/integrations/mcp`;

/** MCP quick start. */
export const DOCS_MCP_QUICKSTART_URL = `${DOCS_BASE_URL}/docs/integrations/mcp/quickstart`;

/** MCP tools reference. */
export const DOCS_MCP_TOOLS_URL = `${DOCS_BASE_URL}/docs/integrations/mcp/tools`;

// ─── Posts ──────────────────────────────────────────────────────────────────

/** Posts (all / list). */
export const DOCS_POSTS_URL = `${DOCS_BASE_URL}/docs/dashboard/posts`;

/** View single post. */
export const DOCS_POST_VIEW_URL = `${DOCS_BASE_URL}/docs/dashboard/posts/%5Bid%5D`;

/** Edit post. */
export const DOCS_POST_EDIT_URL = `${DOCS_BASE_URL}/docs/dashboard/posts/edit/edit`;

/** Drafts. */
export const DOCS_POSTS_DRAFTS_URL = `${DOCS_BASE_URL}/docs/dashboard/posts/drafts`;

/** Posted. */
export const DOCS_POSTS_POSTED_URL = `${DOCS_BASE_URL}/docs/dashboard/posts/posted`;

/** Scheduled. */
export const DOCS_POSTS_SCHEDULED_URL = `${DOCS_BASE_URL}/docs/dashboard/posts/scheduled`;

// ─── Bulk tools ─────────────────────────────────────────────────────────────

/** Bulk tools overview. */
export const DOCS_BULK_TOOLS_URL = `${DOCS_BASE_URL}/docs/dashboard/bulk-tools`;

/** Bulk image scheduling. */
export const DOCS_BULK_TOOLS_IMAGE_URL = `${DOCS_BASE_URL}/docs/dashboard/bulk-tools/image`;

/** Bulk video scheduling. */
export const DOCS_BULK_TOOLS_VIDEO_URL = `${DOCS_BASE_URL}/docs/dashboard/bulk-tools/video`;

// ─── Connection flows (select account / page) ────────────────────────────────

/** Instagram via Facebook Page (connect flow). */
export const DOCS_CONNECT_INSTAGRAM_FACEBOOK_SELECT_URL = `${DOCS_BASE_URL}/docs/dashboard/connect/instagram-facebook/select`;

/** Choose Instagram account (via Facebook Page). */
export const DOCS_CONNECTIONS_INSTAGRAM_SELECT_URL = `${DOCS_BASE_URL}/docs/dashboard/connections/instagram/select`;

/** Choose Facebook Page. */
export const DOCS_CONNECTIONS_FACEBOOK_SELECT_URL = `${DOCS_BASE_URL}/docs/dashboard/connections/facebook/select`;

/** Choose LinkedIn accounts. */
export const DOCS_CONNECTIONS_LINKEDIN_SELECT_URL = `${DOCS_BASE_URL}/docs/dashboard/connections/linkedin/select`;

// ─── Post types ──────────────────────────────────────────────────────────────

/** Text post type. */
export const DOCS_TEXT_POST_TYPE_URL = `${DOCS_BASE_URL}/docs/post-types/text`;

/** Image post type. */
export const DOCS_IMAGE_POST_TYPE_URL = `${DOCS_BASE_URL}/docs/post-types/image`;

/** Video post type. */
export const DOCS_VIDEO_POST_TYPE_URL = `${DOCS_BASE_URL}/docs/post-types/video`;

/** Collection post type. */
export const DOCS_COLLECTION_POST_TYPE_URL = `${DOCS_BASE_URL}/docs/post-types/collection`;

/** Threads post type. */
export const DOCS_THREADS_POST_TYPE_URL = `${DOCS_BASE_URL}/docs/post-types/thread`;

// ─── Onboarding ──────────────────────────────────────────────────────────────

/** Onboarding overview. */
export const DOCS_ONBOARDING_URL = `${DOCS_BASE_URL}/docs/onboarding`;

/** Onboarding welcome / goal. */
export const DOCS_ONBOARDING_GOAL_URL = `${DOCS_BASE_URL}/docs/onboarding/step2`;

/** Onboarding connect accounts. */
export const DOCS_ONBOARDING_CONNECT_URL = `${DOCS_BASE_URL}/docs/onboarding/step3`;

/** Onboarding complete. */
export const DOCS_ONBOARDING_COMPLETE_URL = `${DOCS_BASE_URL}/docs/onboarding/step4`;

// ─── Privacy ───────────────────────────────────────────────────────────────

/** Privacy policy. */
export const DOCS_PRIVACY_URL = `${DOCS_BASE_URL}/docs/privacy`;

// ─── Terms ───────────────────────────────────────────────────────────────

/** Terms of service. */
export const DOCS_TERMS_URL = `${DOCS_BASE_URL}/docs/terms`;
