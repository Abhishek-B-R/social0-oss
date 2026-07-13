import { listPosts, deletePost, publishPost, schedulePost } from "../api/posts.js";
import { pollUntilComplete } from "../api/jobs.js";
import ora from "ora";
import { printOutput, success, truncate } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { parseNaturalTime } from "../utils/dates.js";
import { resolvePostId, shortId } from "../utils/ids.js";
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
      if (format === "json" || format === "yaml") {
        printOutput(result, format);
        return;
      }

      const rows = result.data.map((p, i) => ({
        "#": i + 1,
        ID: p.id,
        CONTENT: truncate(p.content, 60),
        CREATED: p.created_at ? new Date(p.created_at).toLocaleDateString() : "—",
      }));
      printOutput(rows, "table");
      if (result.data.length > 0) {
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

    const id = await resolvePostId(draftId);

    if (action === "delete") {
      const confirmed = await confirmAction(`Delete draft ${shortId(id)}… (${id})?`);
      if (!confirmed) return;
      await withSpinner("Deleting...", () => deletePost(id));
      success("Draft deleted.");
      return;
    }

    if (action === "publish") {
      const spinner = ora("Publishing draft...").start();
      const result = await publishPost(id);
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
        schedulePost(id, { scheduledAt, timezone: getTimezone() }),
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
