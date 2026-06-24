import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Must run before any module that reads process.env (ESM hoists static imports).
config({
  path: resolve(fileURLToPath(new URL("../..", import.meta.url)), ".env"),
});

const { loadEnv } = await import("@social0/shared");
const { buildApp } = await import("./app.js");

const env = loadEnv();

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  const scheme = app.initialConfig.https ? "https" : "http";
  app.log.info(`API server listening on ${scheme}://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
