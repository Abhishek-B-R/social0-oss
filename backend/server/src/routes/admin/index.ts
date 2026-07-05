import type { FastifyInstance } from "fastify";
import { desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { publishFailures, publishJobs } from "../../db/schema.js";
import { verifyAdminRequest } from "../../lib/admin-auth.js";
import { enforceRateLimit, redis } from "../../lib/ratelimit.js";
import { Ratelimit } from "@upstash/ratelimit";

const adminIpLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "rl:admin_ip",
    })
  : null;

export async function registerAdminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    const ip = request.ip || "unknown";
    const rate = await enforceRateLimit(adminIpLimiter, `admin:${ip}`);
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }
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

  app.get("/queues", async (request) => {
    const names = Object.keys(request.server.queues) as Array<
      keyof typeof request.server.queues
    >;
    const depths = await Promise.all(
      names.map(async (name) => {
        const q = request.server.queues[name];
        const counts = await q.getJobCounts(
          "waiting",
          "active",
          "delayed",
          "failed",
          "completed",
        );
        return { name, counts };
      }),
    );
    return { queues: depths };
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
