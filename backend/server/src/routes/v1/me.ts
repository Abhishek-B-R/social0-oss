import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { apiKeys, user, userSettings } from "../../db/schema.js";
import { apiError } from "../../lib/api-errors.js";
import { requireV1ApiKey, v1UserId } from "../../middleware/api-auth.js";

export async function registerMeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireV1ApiKey);

  app.get("/me", async (request, reply) => {
    const userId = v1UserId(request);
    const auth = request.v1Auth!;

    const [profile, settings, keyRows] = await Promise.all([
      db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
        },
      }),
      db.query.userSettings.findFirst({
        where: eq(userSettings.userId, userId),
        columns: { timezone: true },
      }),
      db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
        })
        .from(apiKeys)
        .where(eq(apiKeys.id, auth.apiKeyId))
        .limit(1),
    ]);

    if (!profile) {
      return reply.status(404).send(apiError("not_found", "User not found."));
    }

    const key = keyRows[0];

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      image: profile.image,
      plan: auth.subscription.tier,
      timezone: settings?.timezone ?? "UTC",
      created_at: profile.createdAt?.toISOString() ?? null,
      api_key: key
        ? {
            id: key.id,
            name: key.name,
            prefix: key.keyPrefix,
          }
        : null,
    };
  });
}
