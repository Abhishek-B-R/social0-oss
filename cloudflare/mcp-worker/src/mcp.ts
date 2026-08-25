import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer, runWithApiKeyAsync } from "@social0/mcp/server";
import type { Env } from "./env.js";

const PUBLIC_MCP_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "ping",
  "tools/list",
  "resources/list",
  "resources/read",
]);

export function isPublicMcpMethod(method: unknown): boolean {
  return typeof method === "string" && PUBLIC_MCP_METHODS.has(method);
}

export async function peekMcpMethods(request: Request): Promise<string[]> {
  if (request.method !== "POST") return [];
  try {
    const body = (await request.clone().json()) as unknown;
    if (Array.isArray(body)) {
      return body
        .map((item) =>
          item && typeof item === "object" && "method" in item
            ? String((item as { method: unknown }).method)
            : "",
        )
        .filter(Boolean);
    }
    if (body && typeof body === "object" && "method" in body) {
      return [String((body as { method: unknown }).method)];
    }
  } catch {
    return [];
  }
  return [];
}

export async function handleMcpRequest(
  request: Request,
  _env: Env,
  apiKey: string | null,
): Promise<Response> {
  const run = async () => {
    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return transport.handleRequest(request, {
      authInfo: apiKey
        ? {
            token: apiKey,
            clientId: "social0-mcp-worker",
            scopes: ["social0:read", "social0:write"],
          }
        : undefined,
    });
  };

  if (apiKey) return runWithApiKeyAsync(apiKey, run);
  return run();
}
