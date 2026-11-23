import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config.js";

type RequestStore = {
  apiKey: string;
  /**
   * Hosted MCP only: the OAuth client's registered name ("ChatGPT", "Claude"),
   * forwarded as `X-Social0-Mcp-Client` so posts are labelled per host.
   */
  mcpClient?: string;
  /** Hosted MCP only: extra headers for every API call (the worker's token signature). */
  headers?: Record<string, string>;
};

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function getRequestApiKey(): string {
  const store = requestContext.getStore();
  if (store?.apiKey) return store.apiKey;
  return config.apiKey;
}

export function runWithApiKey<T>(apiKey: string, fn: () => T): T {
  return requestContext.run({ apiKey }, fn);
}

export function getRequestMcpClient(): string | undefined {
  return requestContext.getStore()?.mcpClient;
}

export function getRequestHeaders(): Record<string, string> {
  return requestContext.getStore()?.headers ?? {};
}

export async function runWithApiKeyAsync<T>(
  apiKey: string,
  fn: () => Promise<T>,
  opts?: { mcpClient?: string | null; headers?: Record<string, string> },
): Promise<T> {
  const mcpClient = opts?.mcpClient ?? undefined;
  return requestContext.run(
    {
      apiKey,
      ...(mcpClient ? { mcpClient } : {}),
      ...(opts?.headers ? { headers: opts.headers } : {}),
    },
    fn,
  );
}

/** The `workspace_id` of the tool call being handled; the API client appends it to scoped paths. */
const workspaceContext = new AsyncLocalStorage<string | undefined>();

export function getRequestWorkspaceId(): string | undefined {
  return workspaceContext.getStore();
}

export function runWithWorkspaceId<T>(workspaceId: string | undefined, fn: () => T): T {
  return workspaceContext.run(workspaceId, fn);
}
