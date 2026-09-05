import chalk from "chalk";
import {
  getInboxDmThread,
  hideComment,
  likeComment,
  listInboxAccounts,
  listInboxComments,
  listInboxDms,
  replyToComment,
  replyToDm,
} from "../api/inbox.js";
import {
  printOutput,
  info,
  warn,
  success,
  truncate,
  sanitizeForTerminal,
} from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { applyGlobalOptions, getFormat } from "./helpers.js";
import { formatPlatformName } from "../utils/aliases.js";
import { resolveAccountRef } from "./inbox-helpers.js";
import { fetchWithOneAutoPage, isEmptyPageWithMore } from "../api/paging.js";
import {
  WINDOW_RANGES,
  type GlobalOptions,
  type InboxCommentList,
  type InboxDmList,
  type InboxListQuery,
  type InboxThread,
  type ReconnectHint,
  type WindowRange,
} from "../types/index.js";

export interface InboxOptions extends GlobalOptions {
  range?: string;
  since?: string;
  until?: string;
  account?: string;
  platform?: string;
  before?: string;
  limit?: string;
  fresh?: boolean;
  unanswered?: boolean;
  dms?: boolean;
  publication?: string;
  text?: string;
  media?: string;
  unlike?: boolean;
  peer?: string;
}

function parseRange(value: string | undefined): WindowRange | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if ((WINDOW_RANGES as readonly string[]).includes(normalized)) {
    return normalized as WindowRange;
  }
  throw new Error(
    `Unknown range "${value}". Use one of: ${WINDOW_RANGES.join(", ")}.`,
  );
}

async function buildQuery(opts: InboxOptions): Promise<InboxListQuery> {
  const range = parseRange(opts.range);
  const limit = opts.limit ? Number(opts.limit) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 24)) {
    throw new Error("--limit must be an integer between 1 and 24.");
  }
  return {
    range: opts.since || opts.until ? (range ?? "custom") : range,
    since: opts.since,
    until: opts.until,
    accountId: opts.account ? await resolveAccountRef(opts.account) : undefined,
    platform: opts.platform
      ? opts.platform.toLowerCase().replace(/^twitter$/, "twitter_x")
      : undefined,
    before: opts.before,
    limit,
    fresh: opts.fresh,
  };
}

function requirePublication(opts: InboxOptions): string {
  if (!opts.publication) {
    throw new Error(
      "--publication <id> is required. It is the `publication_id` shown by `social0 inbox comments --json`.",
    );
  }
  return opts.publication;
}

function printListFooter(
  data: InboxCommentList | InboxDmList,
  opts?: { autoPaged?: boolean },
): void {
  if (opts?.autoPaged) {
    console.log("");
    info("The newest publications had nothing in this window; showing the next page.");
  }
  for (const notice of data.notices) {
    console.log("");
    info(`${formatPlatformName(notice.platform)}: ${notice.message}`);
  }
  for (const err of data.fetch_errors) {
    console.log("");
    warn(`${formatPlatformName(err.platform)}: ${err.error}`);
  }
  printReconnect(data.accounts_needing_reconnect);
  if (data.has_more && data.next_before) {
    console.log("");
    console.log(
      chalk.dim(`  More available — re-run with --before ${data.next_before}`),
    );
  }
}

function printReconnect(reconnect: ReconnectHint[]): void {
  if (reconnect.length === 0) return;
  console.log("");
  warn(
    `Reconnect needed: ${reconnect
      .map(
        (a) =>
          `${formatPlatformName(a.platform)}${a.username ? ` (@${a.username})` : ""}`,
      )
      .join(", ")}`,
  );
  console.log(chalk.dim("  social0 accounts connect <platform>"));
}

function commentRows(threads: InboxThread[]) {
  return threads.map((t) => ({
    comment_id: t.comment.id,
    publication_id: t.comment.publication_id,
    platform: formatPlatformName(t.comment.platform),
    author: t.comment.author_handle
      ? `@${t.comment.author_handle}`
      : t.comment.author_name,
    comment: truncate(t.comment.text.replace(/\s+/g, " ").trim(), 52),
    on_post: truncate(t.comment.post_snippet, 28),
    replies: t.replies.length,
    status: t.answered ? "answered" : "unanswered",
    when: t.comment.created_at?.slice(0, 16).replace("T", " ") ?? "—",
  }));
}

export async function inboxCommand(
  action: string | undefined,
  arg: string | undefined,
  opts: InboxOptions,
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    if (action === "accounts") {
      const mode = opts.dms ? "dms" : "comments";
      const accounts = await listInboxAccounts(mode);
      if (accounts.length === 0) {
        info(
          mode === "dms"
            ? "No connected accounts support inbox DMs yet (X and Bluesky today)."
            : "No connected accounts have a live comment inbox yet.",
        );
        return;
      }
      printOutput(
        accounts.map((a) => ({
          id: a.id,
          platform: formatPlatformName(a.platform),
          username: a.username ?? "—",
          needs_reconnect: a.missing_scopes.length > 0 ? "yes" : "no",
        })),
        format,
      );
      return;
    }

    if (action === "reply") {
      if (!arg) throw new Error("Usage: social0 inbox reply <comment-id> --publication <id> --text \"...\"");
      const publicationId = requirePublication(opts);
      if (!opts.text?.trim() && !opts.media) {
        throw new Error("Pass --text and/or --media.");
      }
      const result = await replyToComment(arg, {
        publication_id: publicationId,
        text: opts.text,
        media_id: opts.media,
      });
      success(`Reply posted${result.reply_id ? ` (${result.reply_id})` : ""}.`);
      return;
    }

    if (action === "like" || action === "unlike") {
      if (!arg) throw new Error(`Usage: social0 inbox ${action} <comment-id> --publication <id>`);
      const publicationId = requirePublication(opts);
      const unlike = action === "unlike" || Boolean(opts.unlike);
      await likeComment(arg, { publication_id: publicationId, unlike });
      success(unlike ? "Comment unliked." : "Comment liked.");
      return;
    }

    if (action === "hide") {
      if (!arg) throw new Error("Usage: social0 inbox hide <comment-id> --publication <id>");
      const publicationId = requirePublication(opts);
      await hideComment(arg, { publication_id: publicationId });
      success("Comment hidden.");
      return;
    }

    if (action === "dms") {
      const query = await buildQuery(opts);
      const { page: data, autoPaged } = await fetchWithOneAutoPage(
        (before) => listInboxDms({ ...query, before }),
        (page) => page.conversations,
        query.before,
      );
      if (format !== "table") {
        printOutput(data, format);
        return;
      }
      if (data.conversations.length === 0) {
        if (isEmptyPageWithMore(data, data.conversations)) {
          info(
            `0 conversations on this page, but older ones remain. Re-run with --before ${data.next_before}.`,
          );
        } else {
          info(`No DM conversations in this range (${data.range}).`);
        }
        printListFooter(data, { autoPaged });
        return;
      }
      printOutput(
        data.conversations.map((c) => ({
          conversation_id: c.conversation_id,
          account_id: c.account_id,
          platform: formatPlatformName(c.platform),
          peer: c.peer_handle ? `@${c.peer_handle}` : c.peer_name,
          snippet: truncate(c.snippet.replace(/\s+/g, " ").trim(), 52),
          last_message: c.last_message_at?.slice(0, 16).replace("T", " ") ?? "—",
        })),
        format,
      );
      printListFooter(data, { autoPaged });
      return;
    }

    if (action === "dm") {
      if (!arg) throw new Error("Usage: social0 inbox dm <conversation-id> --account <id>");
      if (!opts.account) throw new Error("--account <id> is required.");
      const accountId = await resolveAccountRef(opts.account);
      const data = await getInboxDmThread(arg, {
        accountId,
        peerId: opts.peer,
        fresh: opts.fresh,
      });
      if (format !== "table") {
        printOutput(data, format);
        return;
      }
      // Peer names and message bodies are written by other social users:
      // scrub them before they reach the terminal.
      const peer = sanitizeForTerminal(
        data.conversation.peer_handle
          ? `@${data.conversation.peer_handle}`
          : data.conversation.peer_name,
      );
      console.log(
        chalk.bold(peer),
        chalk.dim(`· ${formatPlatformName(data.conversation.platform)}`),
      );
      console.log("");
      for (const m of data.messages) {
        const who = m.is_own
          ? chalk.green("you")
          : chalk.cyan(sanitizeForTerminal(m.author_name));
        const when = m.created_at?.slice(0, 16).replace("T", " ") ?? "";
        const body = sanitizeForTerminal(
          m.text.trim() || (m.attachment ? `[${m.attachment.type}]` : ""),
        );
        console.log(`${chalk.dim(when)}  ${who}: ${body}`);
      }
      if (!data.conversation.can_reply) {
        console.log("");
        warn("This conversation is read-only on the platform.");
      }
      return;
    }

    if (action === "dm-reply") {
      if (!arg) throw new Error("Usage: social0 inbox dm-reply <conversation-id> --account <id> --text \"...\"");
      if (!opts.account) throw new Error("--account <id> is required.");
      if (!opts.text?.trim() && !opts.media) {
        throw new Error("Pass --text and/or --media.");
      }
      const accountId = await resolveAccountRef(opts.account);
      const result = await replyToDm(arg, {
        account_id: accountId,
        peer_id: opts.peer,
        text: opts.text,
        media_id: opts.media,
      });
      success(`Message sent${result.message_id ? ` (${result.message_id})` : ""}.`);
      return;
    }

    if (action && action !== "comments") {
      console.error(`Unknown inbox action: ${action}`);
      console.error(
        "Usage: social0 inbox [comments|dms|dm <id>|dm-reply <id>|reply <id>|like <id>|unlike <id>|hide <id>|accounts]",
      );
      process.exit(1);
    }

    const query = await buildQuery(opts);
    const { page: data, autoPaged } = await fetchWithOneAutoPage(
      (before) => listInboxComments({ ...query, before }),
      (page) => page.threads,
      query.before,
    );
    const threads = opts.unanswered
      ? data.threads.filter((t) => !t.answered)
      : data.threads;

    if (format !== "table") {
      printOutput({ ...data, threads }, format);
      return;
    }

    if (threads.length === 0) {
      if (isEmptyPageWithMore(data, data.threads)) {
        // Empty is not "done": this page of publications had no comments,
        // older publications are still unscanned.
        info(
          `0 threads on this page, but older publications remain. Re-run with --before ${data.next_before}, or widen --range.`,
        );
      } else {
        info(
          opts.unanswered
            ? `No unanswered comments in this range (${data.range}).`
            : `No comments in this range (${data.range}).`,
        );
      }
      printListFooter(data, { autoPaged });
      return;
    }

    printOutput(commentRows(threads), format);
    console.log("");
    console.log(
      chalk.dim(
        '  Reply: social0 inbox reply <comment_id> --publication <publication_id> --text "..."',
      ),
    );
    printListFooter(data, { autoPaged });
  } catch (err) {
    exitWithError(err);
  }
}
