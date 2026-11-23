import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { teamMembers, teams, workspaces } from "../../db/schema.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";
import { workspaceContextFor } from "../../lib/workspace/context.js";

/** Team workspaces the caller can pass as `workspace_id`, with what their role allows there. */
export async function registerWorkspacesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  app.get("/workspaces", async (request) => {
    const userId = v1UserId(request);
    const rows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .innerJoin(teamMembers, eq(teamMembers.teamId, workspaces.teamId))
      .where(eq(teamMembers.userId, userId))
      .orderBy(asc(teams.name), asc(workspaces.name))
      .innerJoin(teams, eq(teams.id, workspaces.teamId));

    // shortcut: one context lookup per workspace; fine at the 5-team cap, batch it if that grows.
    const contexts = await Promise.all(rows.map((r) => workspaceContextFor(userId, r.id)));
    return {
      data: contexts
        .filter((ctx) => ctx !== null)
        .map((ctx) => ({
          id: ctx.workspaceId,
          name: ctx.workspaceName,
          team_id: ctx.teamId,
          team_name: ctx.teamName,
          role: ctx.isOwner ? "owner" : ctx.role,
          // A teammate's access pauses while the owner's plan lapses.
          active: ctx.isOwner || ctx.teamsEnabled,
          permissions: [...ctx.permissions].sort(),
        })),
    };
  });
}
