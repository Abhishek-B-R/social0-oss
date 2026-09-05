import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Social0ApiError } from "../api/client.js";
import { accountsApi, analyticsApi, inboxApi } from "../api/index.js";
import type {
  GetAnalyticsOverviewInput,
  GetInboxDmThreadInput,
  GetPostAnalyticsInput,
  ListInboxCommentsInput,
  ListInboxDmsInput,
  ModerateCommentInput,
  ReplyToCommentInput,
  ReplyToDmInput,
} from "../schemas/tools.js";
import type {
  AnalyticsWindowQuery,
  InboxListQuery,
  MetricSet,
  WindowRange,
} from "../types/index.js";
import { resolveAccountIds } from "../utils/accounts.js";
import {
  emptyPageWithMoreNote,
  fetchWithOneAutoPage,
  isEmptyPageWithMore,
} from "../api/paging.js";
import { formatToolError, isUuid } from "../utils/index.js";
import { UNTRUSTED_NOTICE, untrusted } from "../utils/untrusted.js";

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

function handleApiError(context: string, error: unknown): CallToolResult {
  if (error instanceof Social0ApiError) {
    return textResult(formatToolError(context, error.toToolMessage()), true);
  }
  const message = error instanceof Error ? error.message : String(error);
  return textResult(formatToolError(context, message), true);
}

/**
 * Accept a raw account UUID or a platform name. The platform form needs the
 * accounts list to disambiguate, and `resolveAccountIds` already reports the
 * "multiple accounts on this platform" case with actionable text.
 */
async function resolveAccount(
  ref: string,
): Promise<{ id: string } | { error: string }> {
  if (isUuid(ref)) return { id: ref };
  const accounts = await accountsApi.listAccounts();
  const { accountIds, errors } = resolveAccountIds([ref], accounts);
  const id = accountIds[0];
  if (!id) return { error: errors.join("; ") || `Unknown account "${ref}"` };
  return { id };
}

type WindowInput = {
  range?: WindowRange | undefined;
  since?: string | undefined;
  until?: string | undefined;
  account?: string | undefined;
  fresh?: boolean | undefined;
};

// `exactOptionalPropertyTypes` is on, so absent options must be omitted rather
// than set to undefined.
async function windowQuery(
  input: WindowInput,
): Promise<AnalyticsWindowQuery | { error: string }> {
  const range = input.since || input.until ? (input.range ?? "custom") : input.range;
  let accountId: string | undefined;
  if (input.account) {
    const resolved = await resolveAccount(input.account);
    if ("error" in resolved) return { error: resolved.error };
    accountId = resolved.id;
  }
  return {
    ...(range ? { range } : {}),
    ...(input.since ? { since: input.since } : {}),
    ...(input.until ? { until: input.until } : {}),
    ...(accountId ? { account_id: accountId } : {}),
    ...(input.fresh !== undefined ? { fresh: input.fresh } : {}),
  };
}

function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function viewsOf(m: MetricSet): number | null {
  return m.views ?? m.impressions ?? null;
}

function metricLine(m: MetricSet): string {
  const shares = (m.shares ?? 0) + (m.reposts ?? 0) + (m.quotes ?? 0);
  return `${compact(viewsOf(m))} views · ${compact(m.likes)} likes · ${compact(
    m.comments,
  )} comments · ${compact(shares)} shares · ${compact(m.engagement)} engagement`;
}

/** Caveats the model must repeat rather than present the numbers as complete. */
function coverageNotes(
  data: {
    sampled?: boolean;
    sample_limit?: number;
    partial?: boolean;
    accounts_needing_reconnect?: Array<{ platform: string; username: string | null }>;
    unsupported?: string[];
    fetch_errors?: Array<{ platform: string; error: string }>;
    notices?: Array<{ platform: string; message: string }>;
  },
  kind: "metrics" | "comments" | "dms" = "metrics",
): string[] {
  const notes: string[] = [];
  if (data.sampled && data.sample_limit) {
    notes.push(
      kind === "metrics"
        ? `Sampled: only the latest ${data.sample_limit} publications in this range were read, so totals are not a lifetime count.`
        : kind === "comments"
          ? `Sampled: only the latest ${data.sample_limit} publications in this range were scanned, so older posts may have comments not listed here.`
          : `Sampled: only ${data.sample_limit} conversations were returned; page with before= for older ones.`,
    );
  }
  if (data.partial) {
    notes.push(
      "Partial: the live request budget ran out before every publication was read. Ask again to load more.",
    );
  }
  for (const a of data.accounts_needing_reconnect ?? []) {
    notes.push(
      `Reconnect needed for ${a.platform}${a.username ? ` (@${a.username})` : ""} at https://social0.app/dashboard/connections`,
    );
  }
  for (const p of data.unsupported ?? []) {
    notes.push(`${p} does not expose this data through its API yet.`);
  }
  for (const e of data.fetch_errors ?? []) {
    notes.push(`${e.platform}: ${e.error}`);
  }
  for (const n of data.notices ?? []) {
    notes.push(`${n.platform}: ${n.message}`);
  }
  return notes;
}

function withNotes(body: string, notes: string[]): string {
  if (notes.length === 0) return body;
  return `${body}\n\nNotes:\n${notes.map((n) => `- ${n}`).join("\n")}`;
}

export async function handleGetAnalytics(
  input: GetAnalyticsOverviewInput,
): Promise<CallToolResult> {
  try {
    const query = await windowQuery(input);
    if ("error" in query) {
      return textResult(formatToolError("get analytics", query.error), true);
    }
    const data = await analyticsApi.getOverview(query);

    if (data.publications.length === 0) {
      return textResult(
        withNotes(
          `No posts published through Social0 have metrics between ${data.since.slice(0, 10)} and ${data.until.slice(0, 10)}. Try a wider range such as 28d.`,
          coverageNotes(data),
        ),
      );
    }

    const lines = [
      `Analytics ${data.range} (${data.since.slice(0, 10)} → ${data.until.slice(0, 10)})`,
      `Totals: ${metricLine(data.totals)}`,
      "",
      "By platform:",
      ...data.by_platform.map(
        (row) =>
          `- ${row.platform} (${row.post_count} post${row.post_count === 1 ? "" : "s"}): ${metricLine(row.metrics)}`,
      ),
    ];

    if (data.top_posts.length > 0) {
      lines.push("", "Top posts:");
      for (const post of data.top_posts.slice(0, 5)) {
        lines.push(
          `- ${post.post_id} [${post.platforms.join(", ")}] ${compact(viewsOf(post.metrics))} views, ${compact(post.metrics.engagement)} engagement — ${post.snippet}`,
        );
      }
    }

    return textResult(withNotes(lines.join("\n"), coverageNotes(data)));
  } catch (error) {
    return handleApiError("get analytics", error);
  }
}

export async function handleGetPostAnalytics(
  input: GetPostAnalyticsInput,
): Promise<CallToolResult> {
  try {
    const data = await analyticsApi.getPostAnalytics(input.post_id);
    const lines = [
      `Post ${data.post_id}`,
      `Totals: ${metricLine(data.totals)}`,
      "",
      "Per network:",
      ...data.publications.map((p) => {
        const detail =
          p.status === "ok"
            ? metricLine(p.metrics)
            : `${p.status}${p.error ? ` — ${p.error}` : ""}`;
        return `- ${p.platform}${p.account_username ? ` (@${p.account_username})` : ""}: ${detail}`;
      }),
    ];
    return textResult(withNotes(lines.join("\n"), coverageNotes(data)));
  } catch (error) {
    return handleApiError("get post analytics", error);
  }
}

export async function handleListInboxComments(
  input: ListInboxCommentsInput,
): Promise<CallToolResult> {
  try {
    const base = await windowQuery(input);
    if ("error" in base) {
      return textResult(formatToolError("list inbox comments", base.error), true);
    }
    const query: InboxListQuery = {
      ...base,
      ...(input.platform ? { platform: input.platform } : {}),
      ...(input.before ? { before: input.before } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    };
    const { page: data, autoPaged } = await fetchWithOneAutoPage(
      (before) =>
        inboxApi.listComments({
          ...query,
          ...(before ? { before } : {}),
        }),
      (page) => page.threads,
      query.before,
    );
    const threads = input.unanswered_only
      ? data.threads.filter((t) => !t.answered)
      : data.threads;
    const pagingNotes = autoPaged
      ? ["The newest publications had no comments in this window; this is the next page."]
      : [];

    if (threads.length === 0) {
      if (isEmptyPageWithMore(data, data.threads)) {
        return textResult(
          withNotes(emptyPageWithMoreNote("comment threads", data.next_before!), [
            ...pagingNotes,
            ...coverageNotes(data, "comments"),
          ]),
        );
      }
      return textResult(
        withNotes(
          input.unanswered_only
            ? `No unanswered comments between ${data.since.slice(0, 10)} and ${data.until.slice(0, 10)}.`
            : `No comments between ${data.since.slice(0, 10)} and ${data.until.slice(0, 10)}.`,
          [...pagingNotes, ...coverageNotes(data, "comments")],
        ),
      );
    }

    const lines: string[] = [
      UNTRUSTED_NOTICE,
      "",
      `${threads.length} comment thread${threads.length === 1 ? "" : "s"} (${data.range})`,
      "",
    ];
    for (const t of threads) {
      const c = t.comment;
      const who = untrusted(c.author_handle ? `@${c.author_handle}` : c.author_name);
      lines.push(
        `[${c.platform}] ${who} on ${untrusted(c.post_snippet)} — ${t.answered ? "answered" : "UNANSWERED"}`,
        `  ${untrusted(c.text)}`,
        `  comment_id=${c.id} publication_id=${c.publication_id}${c.created_at ? ` at=${c.created_at}` : ""}`,
      );
      for (const r of t.replies) {
        const rw = r.is_own ? "you" : untrusted(r.author_handle ?? r.author_name);
        lines.push(`    ↳ ${rw}: ${untrusted(r.text)}`);
      }
      lines.push("");
    }
    if (data.has_more && data.next_before) {
      lines.push(`More available: call again with before="${data.next_before}".`);
    }
    lines.push(
      "Reply with reply_to_comment using both comment_id and publication_id.",
    );

    return textResult(
      withNotes(lines.join("\n"), [...pagingNotes, ...coverageNotes(data, "comments")]),
    );
  } catch (error) {
    return handleApiError("list inbox comments", error);
  }
}

export async function handleReplyToComment(
  input: ReplyToCommentInput,
): Promise<CallToolResult> {
  try {
    const result = await inboxApi.replyToComment(input.comment_id, {
      publication_id: input.publication_id,
      text: input.text,
      ...(input.media_id ? { media_id: input.media_id } : {}),
    });
    return textResult(
      `Reply posted${result.reply_id ? ` (id ${result.reply_id})` : ""}.`,
    );
  } catch (error) {
    return handleApiError("reply to comment", error);
  }
}

export async function handleModerateComment(
  input: ModerateCommentInput,
): Promise<CallToolResult> {
  try {
    if (input.action === "hide") {
      await inboxApi.hideComment(input.comment_id, {
        publication_id: input.publication_id,
      });
      return textResult("Comment hidden.");
    }
    await inboxApi.likeComment(input.comment_id, {
      publication_id: input.publication_id,
      unlike: input.action === "unlike",
    });
    return textResult(
      input.action === "unlike" ? "Comment unliked." : "Comment liked.",
    );
  } catch (error) {
    return handleApiError(`${input.action} comment`, error);
  }
}

export async function handleListInboxDms(
  input: ListInboxDmsInput,
): Promise<CallToolResult> {
  try {
    const base = await windowQuery(input);
    if ("error" in base) {
      return textResult(formatToolError("list inbox DMs", base.error), true);
    }
    const { page: data, autoPaged } = await fetchWithOneAutoPage(
      (before) =>
        inboxApi.listDms({
          ...base,
          ...(before ? { before } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
        }),
      (page) => page.conversations,
      input.before,
    );
    const pagingNotes = autoPaged
      ? ["The first page had no conversations in this window; this is the next page."]
      : [];

    if (data.conversations.length === 0) {
      if (isEmptyPageWithMore(data, data.conversations)) {
        return textResult(
          withNotes(emptyPageWithMoreNote("conversations", data.next_before!), [
            ...pagingNotes,
            ...coverageNotes(data, "dms"),
          ]),
        );
      }
      return textResult(
        withNotes(
          `No DM conversations between ${data.since.slice(0, 10)} and ${data.until.slice(0, 10)}. Inbox DMs currently cover X and Bluesky.`,
          [...pagingNotes, ...coverageNotes(data, "dms")],
        ),
      );
    }

    const lines = [
      UNTRUSTED_NOTICE,
      "",
      `${data.conversations.length} conversation${data.conversations.length === 1 ? "" : "s"} (${data.range})`,
      "",
      ...data.conversations.map((c) => {
        const peer = untrusted(c.peer_handle ? `@${c.peer_handle}` : c.peer_name);
        return [
          `[${c.platform}] ${peer}${c.last_message_at ? ` · ${c.last_message_at}` : ""}`,
          `  ${c.snippet.trim() ? untrusted(c.snippet) : "(no text)"}`,
          `  conversation_id=${c.conversation_id} account=${c.account_id}`,
        ].join("\n");
      }),
    ];
    if (data.has_more && data.next_before) {
      lines.push("", `More available: call again with before="${data.next_before}".`);
    }
    return textResult(
      withNotes(lines.join("\n"), [...pagingNotes, ...coverageNotes(data, "dms")]),
    );
  } catch (error) {
    return handleApiError("list inbox DMs", error);
  }
}

export async function handleGetInboxDmThread(
  input: GetInboxDmThreadInput,
): Promise<CallToolResult> {
  try {
    const account = await resolveAccount(input.account);
    if ("error" in account) {
      return textResult(formatToolError("get DM thread", account.error), true);
    }
    const data = await inboxApi.getDmThread(input.conversation_id, {
      account_id: account.id,
      ...(input.peer_id ? { peer_id: input.peer_id } : {}),
      ...(input.fresh !== undefined ? { fresh: input.fresh } : {}),
    });
    const peer = untrusted(
      data.conversation.peer_handle
        ? `@${data.conversation.peer_handle}`
        : data.conversation.peer_name,
    );
    const lines = [
      UNTRUSTED_NOTICE,
      "",
      `${peer} on ${data.conversation.platform} (${data.messages.length} message${data.messages.length === 1 ? "" : "s"})`,
      "",
      ...data.messages.map((m) => {
        const who = m.is_own ? "you" : untrusted(m.author_name);
        const body = m.text.trim()
          ? untrusted(m.text)
          : m.attachment
            ? `[${m.attachment.type}]`
            : "";
        return `${m.created_at ?? ""} ${who}: ${body}`.trim();
      }),
    ];
    if (!data.conversation.can_reply) {
      lines.push("", "This conversation is read-only on the platform.");
    }
    return textResult(lines.join("\n"));
  } catch (error) {
    return handleApiError("get DM thread", error);
  }
}

export async function handleReplyToDm(
  input: ReplyToDmInput,
): Promise<CallToolResult> {
  try {
    const account = await resolveAccount(input.account);
    if ("error" in account) {
      return textResult(formatToolError("reply to DM", account.error), true);
    }
    const result = await inboxApi.replyToDm(input.conversation_id, {
      account_id: account.id,
      text: input.text,
      ...(input.peer_id ? { peer_id: input.peer_id } : {}),
      ...(input.media_id ? { media_id: input.media_id } : {}),
    });
    return textResult(
      `Message sent${result.message_id ? ` (id ${result.message_id})` : ""}.`,
    );
  } catch (error) {
    return handleApiError("reply to DM", error);
  }
}
