import fs from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import {
  setupFastifyErrorHandler,
  captureSentryTestError,
} from "./instrument.js";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { registerQueuePlugin } from "./plugins/queue.js";
import { registerLoggingPlugin } from "./plugins/logging.js";
import { registerMetricsPlugin } from "./plugins/metrics.js";
import { registerSecurityHeadersPlugin } from "./plugins/security-headers.js";
import { registerV1Routes } from "./routes/v1/index.js";
import { registerApiRoutes } from "./routes/api/index.js";
import { registerAdminRoutes } from "./routes/admin/index.js";
import { registerDocsRoutes } from "./routes/docs.js";
import { registerMcpOAuthPublicRoutes } from "./routes/oauth/mcp.js";
import { getCorsOrigins } from "./lib/app-url.js";
import {
  allowsMissingCorsOrigin,
  isMcpOAuthCorsOrigin,
  isMcpOAuthPublicPath,
} from "./lib/cors-policy.js";

function loadHttpsOptions(): { key: Buffer; cert: Buffer } | undefined {
  const backendRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const certDirs = [
    resolve(backendRoot, "certificates"),
    resolve(backendRoot, "../frontend/certificates"),
    resolve(backendRoot, "../certificates"),
  ];

  for (const dir of certDirs) {
    const fileSets: [string, string][] = [
      ["key.pem", "cert.pem"],
      ["localhost-key.pem", "localhost.pem"],
    ];
    for (const [keyFile, certFile] of fileSets) {
      const keyPath = resolve(dir, keyFile);
      const certPath = resolve(dir, certFile);
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        return {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };
      }
    }
  }

  return undefined;
}

export async function buildApp() {
  const https = loadHttpsOptions();
  const app = Fastify({
    ...(https ? { https } : {}),
    bodyLimit: 1_048_576,
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
    requestIdHeader: "x-request-id",
    genReqId: (req) =>
      (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
    trustProxy:
      process.env.TRUST_PROXY === "true" ||
      (process.env.TRUST_PROXY !== "false" &&
        process.env.NODE_ENV === "production"),
  });

  if (process.env.SENTRY_DSN) {
    setupFastifyErrorHandler(app);
  }

  const corsOrigins = getCorsOrigins();
  await app.register(cors, () => {
    return (
      req: FastifyRequest,
      callback: (
        err: Error | null,
        options: { origin: boolean; credentials: boolean } | false,
      ) => void,
    ) => {
      const origin = req.headers.origin;
      const credentials = true;
      const path = req.url.split("?")[0] ?? "";
      if (!origin) {
        if (
          process.env.NODE_ENV !== "production" ||
          allowsMissingCorsOrigin(req)
        ) {
          callback(null, { origin: false, credentials });
          return;
        }
        callback(new Error("CORS origin required"), false);
        return;
      }
      if (corsOrigins.includes(origin)) {
        callback(null, { origin: true, credentials });
        return;
      }
      // Claude Connectors hit MCP OAuth endpoints with Origin: https://claude.ai
      if (isMcpOAuthPublicPath(path) && isMcpOAuthCorsOrigin(origin)) {
        callback(null, { origin: true, credentials });
        return;
      }
      callback(new Error("CORS origin not allowed"), false);
    };
  });
  await app.register(cookie);
  await app.register(registerSecurityHeadersPlugin);
  await app.register(registerLoggingPlugin);
  await app.register(registerMetricsPlugin);
  await app.register(registerQueuePlugin);

  app.get("/health", async () => ({
    ok: true,
    service: "server",
    ts: new Date().toISOString(),
  }));

  if (process.env.SENTRY_DSN && process.env.NODE_ENV !== "production") {
    app.get("/debug-sentry", async () => captureSentryTestError());
  }

  await app.register(registerV1Routes, { prefix: "/v1" });
  await app.register(registerApiRoutes, { prefix: "/api" });
  await app.register(registerAdminRoutes, { prefix: "/admin" });
  await app.register(registerMcpOAuthPublicRoutes);
  await app.register(registerDocsRoutes);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const isV1 = request.url.startsWith("/v1");
    if (isV1) {
      return reply.status(500).send({
        error: {
          code: "internal_error",
          message: "An unexpected error occurred.",
        },
      });
    }
    return reply.status(500).send({ error: "Internal server error" });
  });

  return app;
}
