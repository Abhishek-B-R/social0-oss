import type { FastifyInstance } from "fastify";
import { registerAccountsRoutes } from "./accounts.js";
import { registerPostsRoutes } from "./posts.js";
import { registerMediaRoutes } from "./media.js";
import { registerJobsRoutes } from "./jobs.js";
import { registerWebhooksRoutes } from "./webhooks.js";

export async function registerV1Routes(app: FastifyInstance) {
  await app.register(registerAccountsRoutes);
  await app.register(registerPostsRoutes);
  await app.register(registerMediaRoutes);
  await app.register(registerJobsRoutes);
  await app.register(registerWebhooksRoutes);
}
