import chalk from "chalk";
import ora from "ora";
import { getJobStatus, pollUntilComplete } from "../api/jobs.js";
import { printOutput, platformStatusIcon } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { formatPlatformName } from "../utils/aliases.js";
import { applyGlobalOptions, getFormat } from "./helpers.js";
import type { GlobalOptions } from "../types/index.js";

export async function statusCommand(
  trackingId: string,
  opts: GlobalOptions & { watch?: boolean },
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    if (opts.watch || format === "table") {
      const spinner = ora("Waiting...").start();
      const final = await pollUntilComplete(trackingId, (status) => {
        spinner.text = renderStatusLine(status);
      });
      spinner.stop();

      if (format === "table") {
        console.log("");
        renderPlatformStatuses(final);
        console.log("");
        if (final.status === "completed") {
          console.log(chalk.green("✓ All platforms published successfully."));
        } else if (final.status === "partial") {
          console.log(chalk.yellow("! Published to some platforms — some failed."));
        } else if (final.status === "failed") {
          console.log(chalk.red("✗ Publishing failed."));
          if (final.failure_reason) console.log(chalk.dim(`  ${final.failure_reason}`));
        }
      } else {
        printOutput(final, format);
      }
      return;
    }

    const status = await getJobStatus(trackingId);
    printOutput(status, format);
  } catch (err) {
    exitWithError(err);
  }
}

function renderStatusLine(status: Awaited<ReturnType<typeof getJobStatus>>): string {
  return `Publishing... ${status.completed}/${status.total} complete (${status.status})`;
}

function renderPlatformStatuses(status: Awaited<ReturnType<typeof getJobStatus>>): void {
  for (const ps of status.platform_statuses) {
    const icon = platformStatusIcon(ps.phase);
    const platform = formatPlatformName(ps.platform);
    const detail = ps.error ?? ps.message ?? "";
    console.log(`  ${icon} ${platform}${detail ? chalk.dim(` — ${detail}`) : ""}`);
  }
}
