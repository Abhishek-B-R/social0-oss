export const API_OAUTH_SCOPES = {
  "me:read": "Read the authenticated user profile and plan.",
  "accounts:read": "List connected social accounts.",
  "accounts:write": "Start OAuth connect and disconnect social accounts.",
  "posts:read": "List and get posts and publication events.",
  "posts:write": "Create, update, delete, schedule, and publish posts.",
  "media:write": "Presign, confirm, and read media uploads.",
  "jobs:read": "Read publish job status and event streams.",
  "webhooks:read": "List webhook subscriptions.",
  "webhooks:write": "Create, update, and delete webhook subscriptions.",
  "social0:read": "Umbrella read access across Social0 (MCP default).",
  "social0:write": "Umbrella write access across Social0 (MCP default).",
} as const;

export type ApiOAuthScope = keyof typeof API_OAUTH_SCOPES;

export function getApiProtectedResourceMetadata(apiBaseUrl: string) {
  const resource = apiBaseUrl.replace(/\/$/, "");
  return {
    resource,
    authorization_servers: [resource, "https://mcp.social0.app"],
    scopes_supported: Object.keys(API_OAUTH_SCOPES),
    bearer_methods_supported: ["header"],
    resource_name: "Social0 API",
    resource_documentation: "https://docs.social0.app/docs/api",
    resource_policy_uri: "https://social0.app/privacy",
    resource_tos_uri: "https://social0.app/terms",
  };
}