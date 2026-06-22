/**
 * Baseline drizzle.__drizzle_migrations when schema changes exist but journal
 * entries are missing (common after manual SQL or partial migrate failures).
 * Then runs drizzle-kit migrate for any remaining migrations.
 *
 * Usage (use direct Neon URL, not pooler):
 *   DATABASE_URL="postgresql://..." npx tsx scripts/db-repair-migrate.ts
 */
import dotenv from "dotenv";
import pg from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { normalizeDatabaseUrl } from "../lib/database-url";

dotenv.config({ path: ".env.local" });

/** tag → SQL that returns a row when the migration is already applied. */
const APPLIED_CHECKS: Record<string, string> = {
  "0027_user_email_unique":
    "SELECT 1 FROM pg_constraint WHERE conname = 'user_email_unique'",
  "0028_add_has_used_trial":
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'has_used_trial'",
  "0029_add_subscription_cancellations":
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscription_cancellations'",
  "0030_add_pending_plan_tier":
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'pending_plan_tier'",
  "0031_add_downgrade_reason":
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'downgrade_reason'",
  "0033_add_subscription_cancel_at_period_end":
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'subscription_cancel_at_period_end'",
  "0034_add_free_posts_used":
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'free_posts_used'",
  "0035_add_email_on_post_failed":
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'email_on_post_failed'",
  "0036_add_trial_claims":
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trial_claims'",
};

function migrationDatabaseUrl(): string {
  const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
  let url = unpooled || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!unpooled && url.includes("-pooler.")) {
    url = url.replace("-pooler.", ".");
  }
  return normalizeDatabaseUrl(url);
}

async function main() {
  const url = migrationDatabaseUrl();
  const host = new URL(url.replace(/^postgresql:/, "http:")).hostname;
  console.log("Repair + migrate on:", host);

  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 30000,
  });

  const journal = JSON.parse(
    fs.readFileSync("db/migrations/meta/_journal.json", "utf8"),
  ).entries as Array<{ tag: string; when: number }>;

  await pool.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  let baselined = 0;
  for (const entry of journal) {
    const filePath = path.join("db/migrations", `${entry.tag}.sql`);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, "utf8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");

    const existing = await pool.query(
      "SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1",
      [hash],
    );
    if ((existing.rowCount ?? 0) > 0) continue;

    const checkSql = APPLIED_CHECKS[entry.tag];
    if (!checkSql) continue;

    const applied = await pool.query(checkSql);
    if ((applied.rowCount ?? 0) === 0) continue;

    await pool.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      [hash, entry.when],
    );
    console.log("Baselined (already applied):", entry.tag);
    baselined++;
  }

  await pool.end();
  console.log(baselined === 0 ? "No baselines needed." : `Baselined ${baselined} migration(s).`);
  console.log("Running drizzle-kit migrate…\n");

  execSync("npx drizzle-kit migrate", {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
  });

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
