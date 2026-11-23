import { and, desc, eq, isNotNull, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, posts } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "../lib/http/request-cookies.js";
import {
  getMcpConnectorClient,
  isMcpConnectorKeyName,
} from "@/lib/mcp-oauth";

/**
 * `dashboard.listAgentConnections`: the "Connected agents" list on the AI
 * agents page. One row per active API key of the signed-in user, with the
 * MCP OAuth connector key labelled by the host that holds it, plus how many
 * posts each key created (from `posts.metadata.source.keyId`).
 *
 * Revoke with the existing `DELETE /api/api-keys/:id` — for the connector key
 * that also disconnects the MCP host.
 *
 * API keys are personal credentials (`/v1` uses the personal pool), so this
 * is never workspace-scoped.
 */

export type AgentConnection = {
  keyId: string;
  name: string;
  /** First characters of the key, safe to show (e.g. "sk_live_AbCdEfGh"). */
  keyPrefix: string;
  /** "mcp_connector": the OAuth key an MCP host (ChatGPT, Claude…) uses. */
  kind: "mcp_connector" | "api_key";
  /** For the connector: the host the user approved last, when known. */
  clientName: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
  /** Posts this key created (personal pool), and when it last did. */
  postsCreated: number;
  lastPostAt: string | null;
};

export type ListAgentConnectionsResult =
  | {
      ok: true;
      data: {
        connections: AgentConnection[];
        /** The approved MCP host, even when its key row is gone. */
        mcpClient: { clientName: string | null; connectedAt: string } | null;
      };
    }
  | { ok: false; error: string };

export async function listAgentConnections(): Promise<ListAgentConnectionsResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Unauthorized" };

  const keyIdExpr = sql<string>`${posts.metadata} -> 'source' ->> 'keyId'`;
  const [keys, postCounts, mcpClient] = await Promise.all([
    db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt)),
    db
      .select({
        keyId: keyIdExpr,
        count: sql<number>`count(*)::int`,
        // drizzle's max() decodes through the column (zone-less timestamp as
        // UTC); a raw sql`max()` string would be parsed in the server's zone.
        lastPostAt: max(posts.createdAt),
      })
      .from(posts)
      .where(and(eq(posts.userId, userId), isNotNull(keyIdExpr)))
      .groupBy(keyIdExpr),
    getMcpConnectorClient(userId).catch(() => null),
  ]);

  const countsByKey = new Map(postCounts.map((r) => [r.keyId, r]));
  const now = Date.now();

  const toIso = (value: Date | string | null | undefined): string | null => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  return {
    ok: true,
    data: {
      connections: keys.map((k) => {
        const isConnector = isMcpConnectorKeyName(k.name);
        const counts = countsByKey.get(k.id);
        return {
          keyId: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          kind: isConnector ? "mcp_connector" : "api_key",
          clientName: isConnector
            ? (mcpClient?.clientName ??
              (k.name === "Claude MCP Connector" ? "Claude" : null))
            : null,
          createdAt: toIso(k.createdAt),
          lastUsedAt: toIso(k.lastUsedAt),
          expiresAt: toIso(k.expiresAt),
          expired: !!k.expiresAt && k.expiresAt.getTime() < now,
          postsCreated: counts?.count ?? 0,
          lastPostAt: toIso(counts?.lastPostAt),
        };
      }),
      mcpClient: mcpClient
        ? { clientName: mcpClient.clientName, connectedAt: mcpClient.connectedAt }
        : null,
    },
  };
}
