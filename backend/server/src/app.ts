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
import { registerPublicAgentRoutes } from "./routes/public-agent.js";
import { registerMcpOAuthPublicRoutes } from "./routes/oauth/mcp.js";
import { getCorsOrigins } from "./lib/app-url.js";
import { apiError, type ApiErrorCode } from "./lib/api-errors.js";
import {
  allowsMissingCorsOrigin,
  isMcpOAuthCorsOrigin,
  isMcpOAuthPublicPath,
} from "./lib/cors-policy.js";

/**
 * Drizzle wraps driver errors, so the SQLSTATE can sit one or two `cause` hops
 * down. Walk a short chain rather than guessing a single shape.
 */
export function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * The 4xx an error asked for, or null when it is a server fault. Fastify types
 * the handler's error as `unknown`, and plugins throw plain objects as often as
 * `Error`s, so read the shape defensively.
 */
function clientErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { statusCode?: unknown }).statusCode;
  if (typeof status !== "number" || !Number.isInteger(status)) return null;
  return status >= 400 && status < 500 ? status : null;
}

function errorMessage(error: unknown): string {
  const message =
    error && typeof error === "object"
      ? (error as { message?: unknown }).message
      : undefined;
  return typeof message === "string" && message.trim()
    ? message
    : "Request could not be processed.";
}

/** Narrow an HTTP status onto the `/v1` error vocabulary. */
function v1CodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "idempotency_conflict";
    case 429:
      return "rate_limit_exceeded";
    case 501:
      return "not_implemented";
    default:
      return "validation_error";
  }
}

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

  // Must be set *before* the route plugins register: Fastify resolves a route's
  // error handler from the instance it was added to, so a handler installed on
  // the root after `register()` never reaches the encapsulated /api and /v1
  // contexts and every error there falls through to Fastify's default — which
  // echoes `error.message` back to the caller. Drizzle's message carries the
  // full SQL statement and its bound parameters.
  app.setErrorHandler((error, request, reply) => {
    const isV1 = request.url.startsWith("/v1");

    // A malformed id reaching a uuid / enum / numeric column is a client error,
    // not a server fault. Postgres reports it as 22P02 (invalid_text_representation)
    // or 22003 (numeric_value_out_of_range); without this every route that takes
    // an id in the path answers 500 and fills the logs with stack traces.
    const pgCode = postgresErrorCode(error);
    if (pgCode === "22P02" || pgCode === "22003") {
      request.log.warn({ err: error, pgCode }, "malformed identifier in request");
      const message = "One or more identifiers in the request are malformed.";
      return isV1
        ? reply.status(400).send(apiError("validation_error", message))
        : reply.status(400).send({ error: message });
    }

    // Schema validation, rate limits and anything else that set an explicit 4xx
    // is the caller's fault and its message is safe to echo — turning those into
    // 500s would be a regression, not hardening.
    const status = clientErrorStatus(error);
    if (status !== null) {
      const message = errorMessage(error);
      request.log.info({ err: error, status }, "client error");
      return isV1
        ? reply.status(status).send(apiError(v1CodeForStatus(status), message))
        : reply.status(status).send({ error: message });
    }

    request.log.error(error);
    if (isV1) {
      return reply
        .status(500)
        .send(apiError("internal_error", "An unexpected error occurred."));
    }
    return reply.status(500).send({ error: "Internal server error" });
  });

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
  await app.register(registerPublicAgentRoutes);

  return app;
}
