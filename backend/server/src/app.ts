import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { registerQueuePlugin } from "./plugins/queue.js";
import { registerV1Routes } from "./routes/v1/index.js";
import { registerApiRoutes } from "./routes/api/index.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(registerQueuePlugin);

  app.get("/health", async () => ({
    ok: true,
    service: "server",
    ts: new Date().toISOString(),
  }));

  await app.register(registerV1Routes, { prefix: "/v1" });
  await app.register(registerApiRoutes, { prefix: "/api" });

  return app;
}
