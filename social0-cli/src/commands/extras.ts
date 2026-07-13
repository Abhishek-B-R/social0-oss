import { input, checkbox } from "@inquirer/prompts";
import { writeProjectConfig, getProjectFilePath } from "../config/project.js";
import { ensureAccounts, getFormat, getTimezone } from "./helpers.js";
import { success } from "../utils/output.js";
import type { GlobalOptions, OutputFormat } from "../types/index.js";

export async function linkCommand(
  opts: GlobalOptions & { platform?: string[]; format?: string },
): Promise<void> {
  const aliases = await ensureAccounts();

  let defaultPlatforms: string[];

  if (opts.platform?.length) {
    defaultPlatforms = opts.platform.map(String);
  } else if (!process.stdin.isTTY) {
    defaultPlatforms = aliases
      .filter((a) => a.account.is_active && a.account.token_status === "active")
      .map((a) => String(a.alias));
  } else {
    const platformChoices = aliases.map((a) => ({
      name: `${a.alias}. ${a.account.platform} (${a.account.username})`,
      value: String(a.alias),
    }));
    defaultPlatforms = platformChoices.length
      ? await checkbox({
          message: "Default platforms for this project:",
          choices: platformChoices,
        })
      : [];
  }

  let outputFormat: string;
  if (opts.format) {
    outputFormat = opts.format;
  } else if (!process.stdin.isTTY) {
    outputFormat = getFormat(opts);
  } else {
    outputFormat = await input({
      message: "Preferred output format (table/json/yaml):",
      default: "table",
    });
  }

  const config = {
    defaultPlatforms,
    outputFormat: (["table", "json", "yaml"].includes(outputFormat)
      ? outputFormat
      : "table") as OutputFormat,
  };

  writeProjectConfig(config);
  success(`Linked project. Config saved to ${getProjectFilePath()}`);
}

export async function watchCommand(_opts: GlobalOptions): Promise<void> {
  const { listPosts } = await import("../api/posts.js");
  const chalk = (await import("chalk")).default;

  console.log(chalk.dim("Watching publishing queue... (Ctrl+C to stop)"));
  console.log("");

  const seen = new Set<string>();

  while (true) {
    try {
      const publishing = await listPosts({ status: "publishing", limit: 20 });
      for (const post of publishing.data) {
        if (!seen.has(post.id)) {
          seen.add(post.id);
          console.log(`  ⟳ ${post.id} — ${post.content.slice(0, 40)}...`);
        }
      }
      const failed = await listPosts({ status: "failed", limit: 5 });
      for (const post of failed.data) {
        if (!seen.has(`fail-${post.id}`)) {
          seen.add(`fail-${post.id}`);
          console.log(chalk.red(`  ✗ ${post.id} — failed`));
        }
      }
    } catch {
      // retry on next tick
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export async function logsCommand(_opts: GlobalOptions): Promise<void> {
  const { listPosts } = await import("../api/posts.js");
  const chalk = (await import("chalk")).default;

  console.log(chalk.dim("Live publishing events... (Ctrl+C to stop)"));
  console.log("");

  let lastCheck = new Date().toISOString();

  while (true) {
    try {
      const posts = await listPosts({ limit: 10 });
      for (const post of posts.data) {
        if (post.updated_at && post.updated_at > lastCheck) {
          const ts = new Date(post.updated_at).toLocaleTimeString();
          const icon =
            post.status === "published"
              ? chalk.green("✓")
              : post.status === "failed"
                ? chalk.red("✗")
                : chalk.yellow("⟳");
          console.log(
            `${chalk.dim(ts)} ${icon} ${post.status} — ${post.content.slice(0, 50)}`,
          );
        }
      }
      lastCheck = new Date().toISOString();
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function exportCommand(
  file: string | undefined,
  opts: GlobalOptions,
): Promise<void> {
  const { listPosts } = await import("../api/posts.js");
  const { writeFileSync } = await import("node:fs");

  const result = await listPosts({ limit: 100 });
  const output = JSON.stringify(result.data, null, 2);

  if (file) {
    writeFileSync(file, output);
    success(`Exported ${result.data.length} posts to ${file}`);
  } else {
    console.log(output);
  }
}

export async function importCommand(
  file: string | undefined,
  _opts: GlobalOptions,
): Promise<void> {
  const { readFileSync } = await import("node:fs");
  const { createPost, scheduleContent } = await import("../api/posts.js");
  const { ensureAccounts } = await import("./helpers.js");
  const { resolveAccountRefs } = await import("../utils/aliases.js");
  const { parseNaturalTime } = await import("../utils/dates.js");

  if (!file) {
    console.error("Usage: social0 import <file.json>");
    process.exit(1);
  }

  const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const posts = Array.isArray(parsed) ? parsed : [parsed];

  const aliases = await ensureAccounts();
  const tz = getTimezone();

  for (const post of posts as Array<{
    content: string;
    platforms?: Array<string | number>;
    schedule?: string;
    scheduled_at?: string;
  }>) {
    const platformIds = post.platforms
      ? resolveAccountRefs(
          post.platforms.map(String),
          aliases.map((a) => a.account),
        )
      : [];

    const scheduleRaw = post.schedule ?? post.scheduled_at;
    if (scheduleRaw) {
      const result = await scheduleContent({
        content: post.content,
        platforms: platformIds,
        scheduledAt: parseNaturalTime(scheduleRaw, tz),
        timezone: tz,
      });
      success(`Imported scheduled post ${result.post_id} for ${result.scheduled_at}`);
    } else {
      const result = await createPost({ content: post.content, platforms: platformIds });
      success(`Imported post ${result.id}`);
    }
  }
}
