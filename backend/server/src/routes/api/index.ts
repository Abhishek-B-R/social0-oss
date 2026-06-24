import type { FastifyInstance } from "fastify";
import { registerAccountsRoutes } from "./accounts.js";
import { registerAuthRoutes } from "./auth.js";
import { registerBillingRoutes } from "./billing.js";
import { registerConnectRoutes } from "./connect/index.js";
import { registerCronRoutes } from "./cron.js";
import { registerMediaApiRoutes } from "./media.js";
import { registerPublishRoutes, registerJobRoutes } from "./publish.js";
import { registerQueueRoutes } from "./queue.js";
import { registerWebhooksRoutes } from "./webhooks.js";
import { registerMiscRoutes } from "./misc.js";
import { registerApiPlatformRoutes } from "./api-platform.js";
import { FRONTEND_API_ROUTES } from "@social0/shared";

export async function registerApiRoutes(app: FastifyInstance) {
  app.get("/routes", async () => ({
    count: FRONTEND_API_ROUTES.length,
    routes: FRONTEND_API_ROUTES,
  }));

  await app.register(registerAuthRoutes);
  await app.register(registerAccountsRoutes);
  await app.register(registerConnectRoutes);
  await app.register(registerMediaApiRoutes);
  await app.register(registerBillingRoutes);
  await app.register(registerQueueRoutes);
  await app.register(registerPublishRoutes);
  await app.register(registerJobRoutes);
  await app.register(registerCronRoutes);
  await app.register(registerWebhooksRoutes);
  await app.register(registerMiscRoutes);
  await app.register(registerApiPlatformRoutes);
}
