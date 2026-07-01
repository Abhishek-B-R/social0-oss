import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";

// Load env before Sentry reads SENTRY_DSN (must run before other app modules).
config({
  path: resolve(fileURLToPath(new URL("../..", import.meta.url)), ".env"),
});

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    enableLogs: true,
    tracesSampleRate: 1.0,
    dataCollection: {
      // userInfo: false,
      // httpBodies: [],
    },
  });
}

export { Sentry };
