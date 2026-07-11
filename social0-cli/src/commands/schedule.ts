import { schedulePost, scheduleContent } from "../api/posts.js";
import { success } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { parseNaturalTime, formatScheduleHelp } from "../utils/dates.js";
import { readFileSync } from "node:fs";
import {
  applyGlobalOptions,
  ensureAccounts,
  getFormat,
  promptContent,
  promptAccountSelection,
  withSpinner,
  getTimezone,
} from "./helpers.js";
import { resolveAccountRefs } from "../utils/aliases.js";
import { printOutput } from "../utils/output.js";
import type { GlobalOptions } from "../types/index.js";

interface ScheduleOptions extends GlobalOptions {
  time?: string;
  content?: string;
  platform?: string[];
}

export async function scheduleCommand(
  target: string | undefined,
  opts: ScheduleOptions,
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    if (target?.endsWith(".json")) {
      const batch = JSON.parse(readFileSync(target, "utf8")) as Array<{
        content: string;
        platforms: Array<string | number>;
        schedule: string;
      }>;
      const aliases = await ensureAccounts();
      for (const item of batch) {
        const platformRefs = item.platforms.map(String);
        const platformIds = resolveAccountRefs(platformRefs, aliases.map((a) => a.account));
        const result = await scheduleContent({
          content: item.content,
          platforms: platformIds,
          scheduledAt: parseNaturalTime(item.schedule, getTimezone()),
          timezone: getTimezone(),
        });
        success(`Scheduled post ${result.post_id.slice(0, 8)} for ${result.scheduled_at}`);
      }
      return;
    }

    if (!opts.time) {
      console.error("Usage: social0 schedule <draft-id> --time <when>");
      console.error("");
      console.error(formatScheduleHelp());
      process.exit(1);
    }

    const scheduledAt = parseNaturalTime(opts.time, getTimezone());

    if (target) {
      const result = await withSpinner("Scheduling...", () =>
        schedulePost(target, { scheduledAt, timezone: getTimezone() }),
      );
      success(`Post scheduled for ${result.scheduled_at}`);
      if (format !== "table") printOutput(result, format);
      return;
    }

    const content = opts.content ?? (await promptContent());
    const aliases = await ensureAccounts();
    const platformIds = opts.platform?.length
      ? resolveAccountRefs(opts.platform, aliases.map((a) => a.account))
      : await promptAccountSelection();

    const result = await withSpinner("Scheduling...", () =>
      scheduleContent({
        content,
        platforms: platformIds,
        scheduledAt,
        timezone: getTimezone(),
      }),
    );
    success(`Post scheduled for ${result.scheduled_at}`);
    if (format !== "table") printOutput(result, format);
  } catch (err) {
    exitWithError(err);
  }
}
