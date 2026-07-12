import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer, runWithApiKeyAsync } from "@social0/mcp-server/server";
import type { Env } from "./env.js";

export async function handleMcpRequest(
  request: Request,
  _env: Env,
  apiKey: string,
): Promise<Response> {
  return runWithApiKeyAsync(apiKey, async () => {
    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return transport.handleRequest(request, {
      authInfo: {
        token: apiKey,
        clientId: "social0-mcp-worker",
        scopes: ["social0:read", "social0:write"],
      },
    });
  });
}
