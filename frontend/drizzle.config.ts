import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import { normalizeDatabaseUrl } from "./lib/database-url";

dotenv.config({ path: ".env.local" });

/** Neon pooler drops long-lived connections; migrations need the direct endpoint. */
function migrationDatabaseUrl(): string {
  const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
  if (unpooled) return normalizeDatabaseUrl(unpooled);

  const pooled = process.env.DATABASE_URL?.trim();
  if (!pooled) {
    throw new Error("DATABASE_URL is not set in .env.local");
  }

  // Neon: ep-xxx-pooler.region.aws.neon.tech → ep-xxx.region.aws.neon.tech
  if (pooled.includes("-pooler.")) {
    return normalizeDatabaseUrl(pooled.replace("-pooler.", "."));
  }

  return normalizeDatabaseUrl(pooled);
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationDatabaseUrl(),
  },
});
