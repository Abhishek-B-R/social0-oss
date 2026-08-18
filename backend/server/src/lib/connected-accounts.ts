import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { connectedAccounts } from "../db/schema.js";
import { connectionScopeCondition } from "./workspace/context.js";

export type ActiveConnectedAccount = {
  id: string;
  platform: string;
  username: string | null;
  scopes: string | null;
  profileImageUrl: string | null;
};

export async function listActiveConnectedAccounts(ctx: {
  resourceUserId: string;
  workspaceId: string | null;
}): Promise<ActiveConnectedAccount[]> {
  return db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      username: connectedAccounts.platformUsername,
      scopes: connectedAccounts.scopes,
      profileImageUrl: connectedAccounts.profileImageUrl,
    })
    .from(connectedAccounts)
    .where(and(connectionScopeCondition(ctx), eq(connectedAccounts.isActive, true)));
}
