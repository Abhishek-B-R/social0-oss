import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiError } from "../../lib/api-errors.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";
import { requireV1LiveReadBudget } from "../../middleware/v1-live-limits.js";
import {
  v1AnalyticsOverview,
  v1ListAnalyticsAccounts,
  v1PostAnalytics,
} from "../../services/v1-analytics.js";
import { WINDOW_PRESETS } from "../../lib/date-window.js";

/** `?fresh=1` bypasses warm cache (still subject to the soft-fresh floor). */
const boolish = z
  .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
  .transform((v) => v === true || v === "1" || v === "true");

const overviewQuerySchema = z.object({
  range: z.enum([...WINDOW_PRESETS, "custom"]).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  account_id: z.string().uuid().optional(),
  fresh: boolish.optional(),
});

function statusFromError(error: unknown): number {
  const code = (error as { statusCode?: unknown })?.statusCode;
  return typeof code === "number" && code >= 400 && code < 600 ? code : 500;
}

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  app.get("/analytics/accounts", async (request) => {
    const userId = v1UserId(request);
    return { data: await v1ListAnalyticsAccounts(userId) };
  });

  // Live reads fan out to platform APIs; gate them like the dashboard RPC does.
  const live = { preHandler: requireV1LiveReadBudget };

  app.get("/analytics/overview", live, async (request, reply) => {
    const userId = v1UserId(request);
    const query = overviewQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply
        .status(400)
        .send(
          apiError(
            "validation_error",
            query.error.issues[0]?.message ?? "Invalid analytics query.",
          ),
        );
    }
    try {
      return await v1AnalyticsOverview(userId, query.data);
    } catch (error) {
      const status = statusFromError(error);
      if (status === 404) {
        return reply
          .status(404)
          .send(apiError("not_found", (error as Error).message));
      }
      throw error;
    }
  });

  app.get("/analytics/posts/:postId", live, async (request, reply) => {
    const userId = v1UserId(request);
    const { postId } = request.params as { postId: string };
    try {
      return await v1PostAnalytics(userId, postId);
    } catch (error) {
      const status = statusFromError(error);
      if (status === 404) {
        return reply.status(404).send(apiError("not_found", "Post not found."));
      }
      if (status === 400) {
        return reply
          .status(400)
          .send(apiError("validation_error", (error as Error).message));
      }
      throw error;
    }
  });
}
