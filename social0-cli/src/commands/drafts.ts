import { listPosts, deletePost, publishPost, schedulePost } from "../api/posts.js";
import { pollUntilComplete } from "../api/jobs.js";
import ora from "ora";
import { printOutput, success, truncate } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { parseNaturalTime } from "../utils/dates.js";
import {
  applyGlobalOptions,
  getFormat,
  withSpinner,
  confirmAction,
  getTimezone,
} from "./helpers.js";
import type { GlobalOptions } from "../types/index.js";

export async function draftsCommand(
  action: string | undefined,
  draftId: string | undefined,
  opts: GlobalOptions & { time?: string },
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    if (!action || action === "list") {
      const result = await listPosts({ status: "draft", limit: 50 });
      const rows = result.data.map((p, i) => ({
        "#": i + 1,
        ID: p.id.slice(0, 8),
        CONTENT: truncate(p.content, 60),
        CREATED: p.created_at ? new Date(p.created_at).toLocaleDateString() : "—",
      }));
      printOutput(rows, format);
      if (format === "table" && result.data.length > 0) {
        console.log("");
        console.log("  social0 drafts publish <id>");
        console.log("  social0 drafts schedule <id> --time \"tomorrow 9am\"");
      }
      return;
    }

    if (!draftId) {
      console.error(`Usage: social0 drafts ${action} <draft-id>`);
      process.exit(1);
    }

    if (action === "delete") {
      const confirmed = await confirmAction(`Delete draft ${draftId.slice(0, 8)}?`);
      if (!confirmed) return;
      await withSpinner("Deleting...", () => deletePost(draftId));
      success("Draft deleted.");
      return;
    }

    if (action === "publish") {
      const spinner = ora("Publishing draft...").start();
      const result = await publishPost(draftId);
      const final = await pollUntilComplete(result.tracking_id, (s) => {
        spinner.text = `Publishing... ${s.completed}/${s.total}`;
      });
      spinner.succeed("Draft published!");
      if (format !== "table") printOutput(final, format);
      return;
    }

    if (action === "schedule") {
      if (!opts.time) {
        console.error("Usage: social0 drafts schedule <id> --time <when>");
        process.exit(1);
      }
      const scheduledAt = parseNaturalTime(opts.time, getTimezone());
      const result = await withSpinner("Scheduling...", () =>
        schedulePost(draftId, { scheduledAt, timezone: getTimezone() }),
      );
      success(`Draft scheduled for ${result.scheduled_at}`);
      return;
    }

    console.error(`Unknown drafts action: ${action}`);
    process.exit(1);
  } catch (err) {
    exitWithError(err);
  }
}
