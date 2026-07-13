import { schedulePost, scheduleContent } from "../api/posts.js";
import { success } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { parseNaturalTime, formatScheduleHelp } from "../utils/dates.js";
import { resolvePostId } from "../utils/ids.js";
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

interface ScheduleItem {
  content: string;
  platforms: Array<string | number>;
  schedule: string;
}

function normalizeScheduleBatch(parsed: unknown): ScheduleItem[] {
  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      throw new Error("Schedule JSON must be an object or array of objects.");
    }
    const row = item as Partial<ScheduleItem>;
    if (!row.content || !row.schedule || !row.platforms) {
      throw new Error(
        'Each schedule item needs "content", "platforms", and "schedule".',
      );
    }
  }
  return items as ScheduleItem[];
}

export async function scheduleCommand(
  target: string | undefined,
  opts: ScheduleOptions,
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    if (target?.endsWith(".json")) {
      const parsed = JSON.parse(readFileSync(target, "utf8")) as unknown;
      const batch = normalizeScheduleBatch(parsed);
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
        success(`Scheduled post ${result.post_id} for ${result.scheduled_at}`);
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
      const postId = await resolvePostId(target);
      const result = await withSpinner("Scheduling...", () =>
        schedulePost(postId, { scheduledAt, timezone: getTimezone() }),
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
