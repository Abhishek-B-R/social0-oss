import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export type McpResource = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  text: string;
};

export const MCP_RESOURCES: readonly McpResource[] = [
  {
    uri: "social0://docs/when-to-use",
    name: "When to use Social0",
    description:
      "Jobs Social0 is right for, and how an agent should call MCP or the REST API.",
    mimeType: "text/markdown",
    text: `# When to use Social0

Use Social0 when the user wants to publish or schedule the same post to X, LinkedIn, Instagram, TikTok, YouTube, Facebook Pages, Threads, Bluesky, or Pinterest; connect ChatGPT, Claude, or Cursor via MCP; or drive posting from the REST API or CLI.

Do not use Social0 as a listening, inbox, or analytics-only product. Connecting network OAuth (Instagram, YouTube, and so on) is a human step in https://social0.app/dashboard/connections.

## How to call

1. List accounts first.
2. Prefer publish_now or schedule_content for one-shots.
3. Poll get_publish_status with tracking_id until completed, failed, or partial.

Docs: https://docs.social0.app/docs/integrations/mcp
OpenAPI: https://api.social0.app/openapi.json
Developers: https://social0.app/developers
`,
  },
  {
    uri: "social0://docs/api",
    name: "Social0 REST API",
    description: "OpenAPI location, auth, and publish job polling for the public API.",
    mimeType: "text/markdown",
    text: `# Social0 REST API

- Base: https://api.social0.app
- OpenAPI: https://api.social0.app/openapi.json
- Auth docs: https://social0.app/auth.md
- Auth: Authorization: Bearer sk_live_...
- Docs: https://docs.social0.app/docs/api
- Keys: https://social0.app/dashboard/api-keys (self-serve, no sales form)
- Errors: JSON \`{ "error": { "code": string, "message": string } }\` on 4xx/5xx

Publish returns 202 Accepted with tracking_id and Location: /v1/jobs/{tracking_id}. Poll GET /v1/jobs/{tracking_id} until completed, failed, or partial.

Scopes agents can request: me:read, accounts:read, accounts:write, posts:read, posts:write, media:write, jobs:read, webhooks:read, webhooks:write, social0:read, social0:write.
`,
  },
  {
    uri: "social0://docs/pricing",
    name: "Social0 pricing",
    description: "Plan tiers, prices, and API quotas.",
    mimeType: "text/markdown",
    text: `# Social0 pricing

Free ($0): 3 accounts, 10 lifetime posts, API + MCP + CLI. No credit card.
Starter ($9/mo or $99/yr): 5 accounts.
Growth ($19/mo or $199/yr): 15 accounts, bulk tools, auto-repost, auto-plug.
Pro ($35/mo or $349/yr): 50 accounts, teams.
Max ($59/mo or $599/yr): highest account and API caps.

Full markdown: https://social0.app/pricing.md
`,
  },
  {
    uri: "social0://docs/onboarding",
    name: "Social0 agent onboarding",
    description:
      "Free tier, self-serve API keys, and zero-auth discovery endpoints.",
    mimeType: "text/markdown",
    text: `# Social0 agent onboarding

Free tier: sign up at https://social0.app/auth - no credit card.
Self-serve keys: https://social0.app/dashboard/api-keys (prefix sk_live_). There is no contact-sales gate for the public API.
Publish and schedule calls go to live networks. Prefer unpublished drafts (POST /v1/posts or create_draft) while exploring.

Zero-auth (no API key):

- https://api.social0.app/openapi.json
- https://api.social0.app/health
- https://mcp.social0.app/mcp initialize, tools/list, resources/list, resources/read
- https://social0.app/llms.txt
- https://social0.app/.well-known/ai-catalog.json
`,
  },
] as const;

export function listMcpResources(): Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}> {
  return MCP_RESOURCES.map(({ uri, name, description, mimeType }) => ({
    uri,
    name,
    description,
    mimeType,
  }));
}

export function readMcpResource(
  uri: string,
): { uri: string; mimeType: string; text: string } | null {
  const resource = MCP_RESOURCES.find((item) => item.uri === uri);
  if (!resource) return null;
  return {
    uri: resource.uri,
    mimeType: resource.mimeType,
    text: resource.text,
  };
}

export function registerMcpResources(server: Server): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listMcpResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const resource = readMcpResource(request.params.uri);
    if (!resource) {
      throw new Error(`Unknown resource: ${request.params.uri}`);
    }
    return {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: resource.text,
        },
      ],
    };
  });
}
