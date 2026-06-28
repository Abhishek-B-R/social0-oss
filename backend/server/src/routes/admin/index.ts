import type { FastifyInstance } from "fastify";
import { desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { publishFailures, publishJobs } from "../../db/schema.js";
import { verifyAdminRequest } from "../../lib/admin-auth.js";

export async function registerAdminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    if (!verifyAdminRequest(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  app.get("/jobs", async (request) => {
    const limit = Math.min(
      100,
      Number((request.query as { limit?: string }).limit ?? 50),
    );
    const jobs = await db
      .select()
      .from(publishJobs)
      .orderBy(desc(publishJobs.createdAt))
      .limit(limit);
    return { jobs };
  });

  app.get("/failures", async (request) => {
    const limit = Math.min(
      100,
      Number((request.query as { limit?: string }).limit ?? 50),
    );
    const failures = await db
      .select()
      .from(publishFailures)
      .where(isNull(publishFailures.resolvedAt))
      .orderBy(desc(publishFailures.createdAt))
      .limit(limit);
    return { failures };
  });

  app.get("/queues", async () => {
    return {
      queues: [],
      note: "Cron jobs run inline on the server; publish dispatches to Cloudflare Workers.",
    };
  });

  app.post("/failures/:id/resolve", async (request, reply) => {
    const { id } = request.params as { id: string };
    await db
      .update(publishFailures)
      .set({ resolvedAt: new Date() })
      .where(eq(publishFailures.id, id));
    return reply.send({ ok: true });
  });
}
