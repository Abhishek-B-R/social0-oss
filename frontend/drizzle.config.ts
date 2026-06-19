import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import { normalizeDatabaseUrl } from "./lib/database-url";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeDatabaseUrl(process.env.DATABASE_URL!),
  },
});
