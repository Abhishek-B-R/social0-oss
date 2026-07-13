import ora from "ora";
import {
  createPost,
  updatePost,
  deletePost,
  listPosts,
  schedulePost,
} from "../api/posts.js";
import { pollUntilComplete } from "../api/jobs.js";
import { printOutput, success, truncate } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { parseNaturalTime } from "../utils/dates.js";
import { resolvePost, resolvePostId, shortId } from "../utils/ids.js";
import { readStdin } from "../utils/files.js";
import {
  applyGlobalOptions,
  ensureAccounts,
  getFormat,
  promptAccountSelection,
  promptContent,
  promptSchedule,
  withSpinner,
  confirmAction,
  getTimezone,
} from "./helpers.js";
import {
  resolveAccountRefs,
  formatPlatformName,
} from "../utils/aliases.js";
import type { GlobalOptions } from "../types/index.js";

interface PostCreateOptions extends GlobalOptions {
  content?: string;
  platform?: string[];
  media?: string[];
  schedule?: string;
  publish?: boolean;
}

export async function postCreateCommand(opts: PostCreateOptions): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    const aliases = await ensureAccounts();
    let content = opts.content;
    if (!content && !process.stdin.isTTY) {
      content = await readStdin();
    }
    if (!content) {
      content = await promptContent();
    }

    let platformIds: string[] = [];
    if (opts.platform?.length) {
      platformIds = resolveAccountRefs(opts.platform, aliases.map((a) => a.account));
    } else {
      platformIds = await promptAccountSelection();
    }

    const payload = {
      content,
      platforms: platformIds,
      media: opts.media,
    };

    if (opts.publish) {
      const { publishNow } = await import("../api/posts.js");
      const spinner = ora("Publishing...").start();
      const result = await publishNow(payload);
      spinner.text = "Waiting for platforms...";
      const final = await pollUntilComplete(result.tracking_id, (s) => {
        spinner.text = `Publishing... ${s.completed}/${s.total} complete`;
      });
      spinner.succeed("Post sent successfully!");

      if (format === "table") {
        const rows = final.platform_statuses.map((ps) => ({
          PLATFORM: formatPlatformName(ps.platform),
          STATUS: ps.phase.includes("success") ? "success" : ps.phase.includes("fail") ? "failed" : ps.phase,
          "POST ID": ps.message ?? "—",
        }));
        console.log("");
        printOutput(rows, "table");
      } else {
        printOutput(final, format);
      }
      return;
    }

    if (opts.schedule) {
      const scheduledAt = parseNaturalTime(opts.schedule, getTimezone());
      const { scheduleContent } = await import("../api/posts.js");
      const result = await withSpinner("Scheduling...", () =>
        scheduleContent({ ...payload, scheduledAt, timezone: getTimezone() }),
      );
      success(`Post scheduled for ${result.scheduled_at}`);
      if (format !== "table") printOutput(result, format);
      return;
    }

    // Skip interactive schedule prompt when non-TTY or flags already supply content+platforms
    const skipSchedulePrompt =
      !process.stdin.isTTY || (!!opts.content && !!opts.platform?.length);

    const scheduleTime = skipSchedulePrompt
      ? undefined
      : await promptSchedule().catch(() => undefined);

    if (scheduleTime) {
      const scheduledAt = parseNaturalTime(scheduleTime, getTimezone());
      const draft = await createPost(payload);
      const result = await withSpinner("Scheduling...", () =>
        schedulePost(draft.id, { scheduledAt, timezone: getTimezone() }),
      );
      success(`Post scheduled for ${result.scheduled_at} (ID: ${result.post_id})`);
      return;
    }

    const result = await withSpinner("Creating draft...", () => createPost(payload));
    success(`Draft created (ID: ${result.id})`);
    if (format !== "table") {
      printOutput(result, format);
    } else {
      console.log("");
      console.log(`  Publish now:    social0 publish ${result.id}`);
      console.log(`  Schedule:       social0 schedule ${result.id} --time "tomorrow 9am"`);
    }
  } catch (err) {
    exitWithError(err);
  }
}

export async function postListCommand(opts: GlobalOptions & { status?: string }): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    const result = await listPosts({ status: opts.status, limit: 50 });
    if (format === "json" || format === "yaml") {
      printOutput(result, format);
      return;
    }

    const rows = result.data.map((p) => ({
      ID: p.id,
      STATUS: p.status,
      CONTENT: truncate(p.content, 50),
      SCHEDULED: p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "—",
      CREATED: p.created_at ? new Date(p.created_at).toLocaleDateString() : "—",
    }));
    printOutput(rows, "table");
    if (result.pagination.total > result.data.length) {
      console.log("");
      console.log(`  Showing ${result.data.length} of ${result.pagination.total} posts.`);
    }
  } catch (err) {
    exitWithError(err);
  }
}

export async function postShowCommand(postId: string, opts: GlobalOptions): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    const post = await resolvePost(postId);
    if (format === "table") {
      printOutput({
        id: post.id,
        status: post.status,
        content: post.content,
        scheduled_at: post.scheduled_at,
        created_at: post.created_at,
        media_ids: post.media_ids,
        failure_reason: post.failure_reason,
      }, "table");
      if (post.platforms?.length) {
        console.log("");
        const rows = post.platforms.map((p) => ({
          PLATFORM: formatPlatformName(p.platform),
          STATUS: p.status,
          URL: p.platform_post_url ?? "—",
        }));
        printOutput(rows, "table");
      }
    } else {
      printOutput(post, format);
    }
  } catch (err) {
    exitWithError(err);
  }
}

export async function postEditCommand(
  postId: string,
  opts: GlobalOptions & { content?: string; platform?: string[] },
): Promise<void> {
  applyGlobalOptions(opts);

  try {
    const id = await resolvePostId(postId);
    const aliases = await ensureAccounts();
    const payload: { content?: string; platforms?: string[] } = {};
    if (opts.content) payload.content = opts.content;
    if (opts.platform?.length) {
      payload.platforms = resolveAccountRefs(opts.platform, aliases.map((a) => a.account));
    }
    if (!payload.content && !payload.platforms) {
      const content = await promptContent();
      payload.content = content;
    }
    await withSpinner("Updating post...", () => updatePost(id, payload));
    success("Post updated.");
  } catch (err) {
    exitWithError(err);
  }
}

export async function postDeleteCommand(postId: string, opts: GlobalOptions): Promise<void> {
  applyGlobalOptions(opts);

  try {
    const id = await resolvePostId(postId);
    const confirmed = await confirmAction(`Delete post ${shortId(id)}… (${id})?`);
    if (!confirmed) return;
    await withSpinner("Deleting...", () => deletePost(id));
    success("Post deleted.");
  } catch (err) {
    exitWithError(err);
  }
}

export async function postInitCommand(_opts: GlobalOptions): Promise<void> {
  const template = {
    content: "Your post content here",
    platforms: [1, 2],
    media: [],
    schedule: "tomorrow 9am",
    metadata: {},
  };
  console.log(JSON.stringify(template, null, 2));
  console.log("");
  console.log("  platforms: use account IDs from `social0 accounts` (1, 2, 3...)");
  console.log("  Save as post.json and run: social0 schedule posts.json");
}
