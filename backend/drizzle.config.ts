import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, ".env") });

/** Neon pooler drops long-lived connections; migrations need the direct endpoint. */
function migrationDatabaseUrl(): string {
  const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
  if (unpooled) return unpooled;

  const pooled = process.env.DATABASE_URL?.trim();
  if (!pooled) {
    throw new Error(
      "Set DATABASE_URL (or DATABASE_URL_UNPOOLED) in backend/.env for migrations",
    );
  }

  if (pooled.includes("-pooler.")) {
    return pooled.replace("-pooler.", ".");
  }

  return pooled;
}

export default defineConfig({
  schema: "./shared/src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationDatabaseUrl(),
  },
});
