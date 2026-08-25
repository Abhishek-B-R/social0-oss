import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

const RESOURCES = [
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

Docs: https://docs.social0.app/mcp
OpenAPI: https://api.social0.app/openapi.json
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
- Auth: Authorization: Bearer sk_live_...
- Docs: https://docs.social0.app/api
- Keys: https://social0.app/dashboard/api-keys

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

Free ($0): 3 accounts, 10 lifetime posts, API + MCP + CLI.
Starter ($9/mo or $99/yr): 5 accounts.
Growth ($19/mo or $199/yr): 15 accounts, bulk tools, auto-repost, auto-plug.
Pro ($35/mo or $349/yr): 50 accounts, teams.
Max ($59/mo or $599/yr): highest account and API caps.

Full markdown: https://social0.app/pricing.md
`,
  },
] as const;

export function registerMcpResources(server: Server): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES.map(({ uri, name, description, mimeType }) => ({
      uri,
      name,
      description,
      mimeType,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const resource = RESOURCES.find((item) => item.uri === request.params.uri);
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
