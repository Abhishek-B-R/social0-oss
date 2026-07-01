import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

// Load env before Sentry reads SENTRY_DSN (must run before other app modules).
config({
  path: resolve(fileURLToPath(new URL("../..", import.meta.url)), ".env"),
});

type SentryModule = typeof import("@sentry/node");

let sentry: SentryModule | null = null;

export async function initSentry(): Promise<SentryModule | null> {
  if (sentry) return sentry;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;

  const mod = await import("@sentry/node");
  mod.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 1.0,
  });
  sentry = mod;
  return sentry;
}

export function getSentry(): SentryModule | null {
  return sentry;
}

export function setupFastifyErrorHandler(app: FastifyInstance): void {
  const mod = getSentry();
  if (mod) mod.setupFastifyErrorHandler(app);
}

export async function captureSentryTestError(): Promise<never> {
  const mod = getSentry();
  mod?.logger.info("User triggered test error", {
    action: "test_error_endpoint",
  });
  throw new Error("My first Sentry error!");
}
