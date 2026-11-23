import { initSentry } from "./instrument.js";

await initSentry();

const { loadEnv } = await import("@social0/shared");
const { buildApp } = await import("./app.js");
const { closeOnShutdownSignals, registerPublishDrain } = await import(
  "./lib/graceful-shutdown.js"
);

const env = loadEnv();

// Fail the deploy rather than run with Idempotency-Key silently ignored.
const { assertIdempotencyStoreConfigured } = await import("./lib/api-idempotency.js");
assertIdempotencyStoreConfigured(env.NODE_ENV);

const app = await buildApp();

// In-process X/TikTok publishes outlive their requests: a deploy's
// `pm2 reload` must let them finish instead of killing them mid-upload.
registerPublishDrain(app);
closeOnShutdownSignals(app);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  const scheme = app.initialConfig.https ? "https" : "http";
  app.log.info(`API server listening on ${scheme}://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
