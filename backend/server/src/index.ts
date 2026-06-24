import "dotenv/config";
import { buildApp } from "./app.js";
import { loadEnv } from "@social0/shared";

const env = loadEnv();

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`API server listening on http://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
