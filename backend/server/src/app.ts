import fs from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { registerQueuePlugin } from "./plugins/queue.js";
import { registerLoggingPlugin } from "./plugins/logging.js";
import { registerMetricsPlugin } from "./plugins/metrics.js";
import { registerSecurityHeadersPlugin } from "./plugins/security-headers.js";
import { registerV1Routes } from "./routes/v1/index.js";
import { registerApiRoutes } from "./routes/api/index.js";
import { registerAdminRoutes } from "./routes/admin/index.js";
import { getTrustedAppOrigins } from "./lib/app-url.js";

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

  const trustedOrigins = getTrustedAppOrigins();
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (trustedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin not allowed"), false);
    },
    credentials: true,
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

  await app.register(registerV1Routes, { prefix: "/v1" });
  await app.register(registerApiRoutes, { prefix: "/api" });
  await app.register(registerAdminRoutes, { prefix: "/admin" });

  return app;
}
