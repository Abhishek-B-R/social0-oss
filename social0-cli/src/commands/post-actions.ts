import {
  bulkDeletePosts,
  duplicatePost,
  postAgain,
  setAutoPlug,
  cancelAutoPlug,
  setAutoRepost,
  disableAutoRepost,
  getPostEvents,
} from "../api/posts.js";
import { printOutput, success, warn } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { resolvePostId } from "../utils/ids.js";
import { formatPlatformName } from "../utils/aliases.js";
import { applyGlobalOptions, confirmAction, getFormat, withSpinner } from "./helpers.js";
import { resolveAccountRef } from "./inbox-helpers.js";
import type { GlobalOptions } from "../types/index.js";

/** Print `result` as JSON/YAML when asked, else the one-line `message`. */
function report(opts: GlobalOptions, message: string, result: unknown): void {
  const format = getFormat(opts);
  if (format === "table") success(message);
  else printOutput(result ?? {}, format);
}

export async function postBulkDeleteCommand(
  refs: string[],
  opts: GlobalOptions & { yes?: boolean },
): Promise<void> {
  applyGlobalOptions(opts);
  try {
    const ids = await Promise.all(refs.map(resolvePostId));
    if (!opts.yes && !(await confirmAction(`Delete ${ids.length} post(s)? Only drafts and scheduled posts can be deleted.`))) {
      return;
    }
    const result = await withSpinner("Deleting...", () => bulkDeletePosts(ids));
    const format = getFormat(opts);
    if (format !== "table") {
      printOutput(result, format);
      return;
    }
    success(`Deleted ${result.deleted.length} post(s).`);
    if (result.failed.length) {
      warn(`${result.failed.length} could not be deleted:`);
      printOutput(result.failed.map((f) => ({ ID: f.id, ERROR: f.error })), "table");
    }
  } catch (err) {
    exitWithError(err);
  }
}

export async function postDuplicateCommand(postId: string, opts: GlobalOptions): Promise<void> {
  applyGlobalOptions(opts);
  try {
    const id = await resolvePostId(postId);
    const result = await withSpinner("Duplicating...", () => duplicatePost(id));
    report(opts, `Draft created (ID: ${result.id})`, result);
  } catch (err) {
    exitWithError(err);
  }
}

export async function postAgainCommand(postId: string, opts: GlobalOptions): Promise<void> {
  applyGlobalOptions(opts);
  try {
    const id = await resolvePostId(postId);
    const result = await withSpinner("Queuing...", () => postAgain(id));
    report(opts, `Posting again as ${result.post_id}`, result);
    if (getFormat(opts) === "table") {
      if (result.warning) warn(result.warning);
      if (result.tracking_id) console.log(`  Track it:  social0 status ${result.tracking_id} --watch`);
    }
  } catch (err) {
    exitWithError(err);
  }
}

export async function postAutoPlugCommand(
  postId: string,
  opts: GlobalOptions & { off?: boolean; metric?: string; threshold?: string; message?: string; account?: string },
): Promise<void> {
  applyGlobalOptions(opts);
  try {
    const id = await resolvePostId(postId);
    if (opts.off) {
      await withSpinner("Cancelling auto-plug...", () => cancelAutoPlug(id));
      report(opts, "Auto-plug cancelled.", { post_id: id, auto_plug: "off" });
      return;
    }
    if ((opts.metric !== "likes" && opts.metric !== "retweets") || !opts.threshold || !opts.message) {
      console.error('Usage: social0 post auto-plug <id> --metric likes|retweets --threshold <n> --message "<text>" [--account <id>]');
      process.exit(1);
    }
    const result = await withSpinner("Setting auto-plug...", async () =>
      setAutoPlug(id, {
        metric: opts.metric as "likes" | "retweets",
        threshold: Number(opts.threshold),
        message: opts.message!,
        account_id: opts.account ? await resolveAccountRef(opts.account) : undefined,
      }),
    );
    report(opts, `Auto-plug set: replies once the post reaches ${opts.threshold} ${opts.metric}.`, result);
  } catch (err) {
    exitWithError(err);
  }
}

export async function postAutoRepostCommand(
  postId: string,
  opts: GlobalOptions & {
    off?: boolean;
    interval?: string;
    max?: string;
    message?: string;
    pause?: boolean;
    resume?: boolean;
  },
): Promise<void> {
  applyGlobalOptions(opts);
  try {
    const id = await resolvePostId(postId);
    if (opts.off) {
      await withSpinner("Disabling auto-repost...", () => disableAutoRepost(id));
      report(opts, "Auto-repost disabled.", { post_id: id, auto_repost: "off" });
      return;
    }
    const result = await withSpinner("Setting auto-repost...", () =>
      setAutoRepost(id, {
        interval_hours: opts.interval !== undefined ? Number(opts.interval) : undefined,
        max_reposts: opts.max !== undefined ? Number(opts.max) : undefined,
        message: opts.message,
        active: opts.pause ? false : opts.resume ? true : undefined,
      }),
    );
    report(opts, `Auto-repost saved (schedule ${result.schedule_id}).`, result);
  } catch (err) {
    exitWithError(err);
  }
}

export async function postEventsCommand(postId: string, opts: GlobalOptions): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);
  try {
    const id = await resolvePostId(postId);
    const result = await getPostEvents(id);
    if (format !== "table") {
      printOutput(result, format);
      return;
    }
    printOutput(
      result.events.map((e) => ({
        TIME: new Date(e.created_at).toLocaleString(),
        PLATFORM: e.platform ? formatPlatformName(e.platform) : "—",
        PHASE: e.phase,
        MESSAGE: e.message ?? "—",
      })),
      "table",
    );
  } catch (err) {
    exitWithError(err);
  }
}
