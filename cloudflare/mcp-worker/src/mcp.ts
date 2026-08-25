import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer, runWithApiKeyAsync } from "@social0/mcp/server";
import type { Env } from "./env.js";
import {
  extractMcpMethods,
  isPublicMcpMethod,
  tryHandlePublicJsonRpc,
} from "./public-rpc.js";

export { isPublicMcpMethod, extractMcpMethods };

export async function peekMcpMethods(request: Request): Promise<string[]> {
  if (request.method !== "POST") return [];
  try {
    const body = (await request.clone().json()) as unknown;
    return extractMcpMethods(body);
  } catch {
    return [];
  }
}

export async function handleMcpRequest(
  request: Request,
  _env: Env,
  apiKey: string | null,
): Promise<Response> {
  if (request.method === "POST") {
    try {
      const body = await request.clone().json();
      const publicResponse = tryHandlePublicJsonRpc(body);
      if (publicResponse) return publicResponse;
    } catch {
      // Fall through to the SDK transport for non-JSON or authenticated calls.
    }
  }

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
