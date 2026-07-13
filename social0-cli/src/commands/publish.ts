import ora from "ora";
import { readFileSync } from "node:fs";
import { publishPost, publishNow, getPost, listPosts } from "../api/posts.js";
import { pollUntilComplete } from "../api/jobs.js";
import { printOutput, success } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { readStdin, parseMarkdownFrontMatter, readFileContent } from "../utils/files.js";
import {
  applyGlobalOptions,
  ensureAccounts,
  getFormat,
  promptAccountSelection,
  promptContent,
  withSpinner,
} from "./helpers.js";
import { resolveAccountRefs, formatPlatformName } from "../utils/aliases.js";
import type { GlobalOptions } from "../types/index.js";
import { parseNaturalTime } from "../utils/dates.js";
import { scheduleContent } from "../api/posts.js";
import { getTimezone } from "./helpers.js";

interface PublishOptions extends GlobalOptions {
  content?: string;
  platform?: string[];
  media?: string[];
}

export async function publishCommand(
  target: string | undefined,
  opts: PublishOptions,
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    if (target === "latest") {
      const posts = await listPosts({ status: "draft", limit: 1 });
      if (posts.data.length === 0) {
        console.error("No drafts found.");
        process.exit(1);
      }
      target = posts.data[0].id;
    }

    if (target?.endsWith(".md")) {
      const parsed = parseMarkdownFrontMatter(readFileContent(target));
      const aliases = await ensureAccounts();
      const platformIds = parsed.platforms
        ? resolveAccountRefs(parsed.platforms, aliases.map((a) => a.account))
        : await promptAccountSelection();

      if (parsed.schedule) {
        const scheduleAt = parsed.schedule;
        const result = await withSpinner("Scheduling...", () =>
          scheduleContent({
            content: parsed.content,
            platforms: platformIds,
            scheduledAt: parseNaturalTime(scheduleAt, getTimezone()),
            timezone: getTimezone(),
          }),
        );
        success(`Scheduled for ${result.scheduled_at}`);
        return;
      }

      const spinner = ora("Publishing...").start();
      const result = await publishNow({ content: parsed.content, platforms: platformIds });
      const final = await pollUntilComplete(result.tracking_id, (s) => {
        spinner.text = `Publishing... ${s.completed}/${s.total}`;
      });
      spinner.succeed("Post sent successfully!");
      printPublishResult(final, format);
      return;
    }

    if (target && !target.includes("*")) {
      const spinner = ora("Publishing...").start();
      const result = await publishPost(target);
      const final = await pollUntilComplete(result.tracking_id, (s) => {
        spinner.text = `Publishing... ${s.completed}/${s.total}`;
      });
      spinner.succeed("Post sent successfully!");
      printPublishResult(final, format);
      return;
    }

    if (target?.includes("*")) {
      const { readdirSync } = await import("node:fs");
      const { join } = await import("node:path");
      const dir = target.includes("/") ? target.replace(/\/[^/]*$/, "") || "." : ".";
      const pattern = target.split("/").pop() ?? target;
      const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
      const files = readdirSync(dir).filter((f) => regex.test(f)).map((f) => join(dir, f));
      for (const file of files) {
        await publishCommand(file, opts);
      }
      return;
    }

    let content = opts.content;
    if (!content && !process.stdin.isTTY) {
      content = await readStdin();
    }
    if (!content) {
      content = await promptContent();
    }

    const aliases = await ensureAccounts();
    let platformIds: string[] = [];
    if (opts.platform?.length) {
      platformIds = resolveAccountRefs(opts.platform, aliases.map((a) => a.account));
    } else {
      platformIds = await promptAccountSelection();
    }

    const spinner = ora("Publishing...").start();
    const result = await publishNow({
      content,
      platforms: platformIds,
      media: opts.media,
    });
    const final = await pollUntilComplete(result.tracking_id, (s) => {
      spinner.text = `Publishing... ${s.completed}/${s.total}`;
    });
    spinner.succeed("Post sent successfully!");
    printPublishResult(final, format);
  } catch (err) {
    exitWithError(err);
  }
}

function printPublishResult(
  final: Awaited<ReturnType<typeof pollUntilComplete>>,
  format: string,
): void {
  const rows = final.platform_statuses.map((ps) => ({
    PLATFORM: formatPlatformName(ps.platform),
    STATUS: ps.phase.includes("success") || ps.phase === "completed" ? "success" : ps.phase.includes("fail") ? "failed" : "publishing",
    DETAIL: ps.error ?? ps.message ?? "—",
  }));
  if (format === "table") {
    console.log("");
    printOutput(rows, "table");
  } else {
    printOutput(final, format as "json" | "yaml");
  }
}
