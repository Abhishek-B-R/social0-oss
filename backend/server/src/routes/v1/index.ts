import type { FastifyInstance } from "fastify";
import { registerAccountsRoutes } from "./accounts.js";
import { registerPostsRoutes } from "./posts.js";
import { registerMediaRoutes } from "./media.js";
import { registerJobsRoutes } from "./jobs.js";
import { registerWebhooksRoutes } from "./webhooks.js";
import { registerMeRoutes } from "./me.js";
import { registerAnalyticsRoutes } from "./analytics.js";
import { registerInboxRoutes } from "./inbox.js";

export async function registerV1Routes(app: FastifyInstance) {
  await app.register(registerMeRoutes);
  await app.register(registerAccountsRoutes);
  await app.register(registerPostsRoutes);
  await app.register(registerMediaRoutes);
  await app.register(registerJobsRoutes);
  await app.register(registerWebhooksRoutes);
  await app.register(registerAnalyticsRoutes);
  await app.register(registerInboxRoutes);
}
