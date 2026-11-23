/**
 * Post mutations shared by the Posts table (row + bulk actions) and the post
 * detail page. Delete and duplicate send one request per 100 posts; the rest
 * run the existing RPCs one post at a time. All return per-post outcomes so
 * callers can summarise ("2 moved, 1 failed").
 */
import {
  deletePostsBatch,
  duplicatePostsBatch,
  POSTS_BATCH_MAX,
  reschedulePost,
  updatePost,
  type DuplicatePostInput,
} from "@/api/posts";
import { publishPost } from "@/api/publish";
import { fetchApi } from "@/lib/fetch-api";
import {
  pollPublicationProgressUntilDone,
  type PublicationProgressRow,
} from "@/lib/publish-order";
import { metadataForCopy } from "./posts-model";

/** The fields a bulk action needs from a post. */
export type PostRef = {
  id: string;
  status: string;
  originalContent: string | null;
  accountIds: string[];
  mediaIds: string[];
  metadata: Record<string, unknown> | null;
  scheduledAt: Date | null;
  /** Queue slot the post holds, so Undo of a reschedule can give it back. */
  queueSlotId?: string | null;
};

export type BatchOutcome = {
  ok: string[];
  failed: { id: string; error: string }[];
};

async function runEach(
  ids: string[],
  fn: (id: string) => Promise<string | null>,
): Promise<BatchOutcome> {
  const out: BatchOutcome = { ok: [], failed: [] };
  for (const id of ids) {
    try {
      const err = await fn(id);
      if (err) out.failed.push({ id, error: err });
      else out.ok.push(id);
    } catch (e) {
      out.failed.push({
        id,
        error: e instanceof Error ? e.message : "Something went wrong. Try again.",
      });
    }
  }
  return out;
}

/** "3 posts" / "1 post". */
export function plural(n: number, noun = "post"): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** Toast-ready summary of a batch. */
export function summarize(
  outcome: BatchOutcome,
  verb: string,
  /** Appended after the count: "Moved 2 posts" + " to drafts". */
  suffix = "",
): { message: string; description?: string; tone: "success" | "warning" | "error" } {
  const okN = outcome.ok.length;
  const badN = outcome.failed.length;
  const firstError = outcome.failed[0]?.error;
  if (badN === 0) return { message: `${verb} ${plural(okN)}${suffix}`, tone: "success" };
  if (okN === 0) {
    return {
      message: `Couldn't ${verb.toLowerCase()} ${badN === 1 ? "the post" : plural(badN)}`,
      description: firstError,
      tone: "error",
    };
  }
  return {
    message: `${verb} ${plural(okN)}${suffix}, ${badN} failed`,
    description: firstError,
    tone: "warning",
  };
}

// ---------------------------------------------------------------------------
// Create / delete
// ---------------------------------------------------------------------------

/**
 * Copy each post into a new draft (same caption, accounts, media, settings).
 * The copy references the same uploads; the server's `updatePost` only deletes
 * an upload removed from a post when no other post still uses it.
 */
export async function duplicatePosts(
  posts: PostRef[],
): Promise<BatchOutcome & { createdIds: string[] }> {
  const out: BatchOutcome & { createdIds: string[] } = { ok: [], failed: [], createdIds: [] };
  const items: DuplicatePostInput[] = [];
  for (const p of posts) {
    if (!p.originalContent?.trim()) {
      out.failed.push({ id: p.id, error: "Posts without a caption can't be duplicated yet." });
    } else if (p.accountIds.length === 0) {
      out.failed.push({ id: p.id, error: "This post has no accounts to copy." });
    } else {
      items.push({
        sourceId: p.id,
        content: p.originalContent,
        accountIds: p.accountIds,
        mediaIds: p.mediaIds,
        metadata: metadataForCopy(p.metadata),
      });
    }
  }
  await inBatches(items, (i) => i.sourceId, out, async (chunk) => {
    const res = await duplicatePostsBatch(chunk);
    out.createdIds.push(...res.createdIds);
    return res;
  });
  return out;
}

/** One request per `POSTS_BATCH_MAX` posts, so a bulk action isn't rate limited per post. */
export async function deletePosts(ids: string[]): Promise<BatchOutcome> {
  const out: BatchOutcome = { ok: [], failed: [] };
  await inBatches(ids, (id) => id, out, deletePostsBatch);
  return out;
}

async function inBatches<T>(
  items: T[],
  idOf: (item: T) => string,
  out: BatchOutcome,
  send: (chunk: T[]) => Promise<BatchOutcome>,
): Promise<void> {
  for (let i = 0; i < items.length; i += POSTS_BATCH_MAX) {
    const chunk = items.slice(i, i + POSTS_BATCH_MAX);
    try {
      const res = await send(chunk);
      out.ok.push(...res.ok);
      out.failed.push(...res.failed);
    } catch (e) {
      // The whole request failed (rate limit, network): every post in it failed.
      const error = e instanceof Error ? e.message : "Something went wrong. Try again.";
      out.failed.push(...chunk.map((item) => ({ id: idOf(item), error })));
    }
  }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export type NextSlot = {
  slotId: string;
  scheduledAt: Date;
  displayLabel: string;
  timezone: string;
};

/** Next free posting-schedule slot, or null when none is set up. */
export async function fetchNextSlot(): Promise<NextSlot | null> {
  const res = await fetchApi("/api/queue/next-slot");
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return null;
    throw new Error("Couldn't load your posting schedule.");
  }
  const data = (await res.json()) as {
    available?: boolean;
    slotId?: string;
    scheduledAt?: string;
    scheduledFor?: string;
    displayLabel?: string;
    displayTime?: string;
    timezone?: string;
  };
  const iso = data.scheduledAt ?? data.scheduledFor;
  if (!data.available || !data.slotId || !iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return {
    slotId: data.slotId,
    scheduledAt: at,
    displayLabel: data.displayLabel ?? data.displayTime ?? "",
    timezone: data.timezone ?? "UTC",
  };
}

export type ScheduleTarget = { kind: "queue" } | { kind: "time"; at: Date };

/**
 * Schedule drafts (approve agent drafts): same caption, accounts and media.
 * "queue" asks for the next free slot before each post so they spread out.
 */
export function scheduleDrafts(
  posts: PostRef[],
  target: ScheduleTarget,
): Promise<BatchOutcome> {
  return runEach(
    posts.map((p) => p.id),
    async (id) => {
      const p = posts.find((x) => x.id === id)!;
      if (p.status !== "draft") return "Only drafts can be scheduled here.";
      if (!p.originalContent?.trim()) return "Add a caption in the editor before scheduling.";
      if (p.accountIds.length === 0) return "Pick at least one account in the editor first.";
      let at: Date;
      let slotId: string | null = null;
      if (target.kind === "queue") {
        const slot = await fetchNextSlot();
        if (!slot) return "No free slot in your posting schedule.";
        at = slot.scheduledAt;
        slotId = slot.slotId;
      } else {
        at = target.at;
      }
      const res = await updatePost(
        p.id,
        p.originalContent,
        p.accountIds,
        at,
        p.mediaIds,
        undefined,
        slotId,
      );
      return res.success ? null : res.error;
    },
  );
}

/** Where a post sat before a reschedule: its time and queue slot (if any). */
export type PreviousSchedule = { id: string; at: Date; slotId: string | null };

/** Move scheduled posts. Returns the previous times and slots for Undo. */
export async function reschedulePosts(
  posts: PostRef[],
  target: ScheduleTarget,
): Promise<BatchOutcome & { previous: PreviousSchedule[] }> {
  const previous: PreviousSchedule[] = [];
  const outcome = await runEach(
    posts.map((p) => p.id),
    async (id) => {
      const p = posts.find((x) => x.id === id)!;
      if (p.status !== "scheduled") return "Only scheduled posts can be moved.";
      let at: Date;
      let slotId: string | null = null;
      if (target.kind === "queue") {
        const slot = await fetchNextSlot();
        if (!slot) return "No free slot in your posting schedule.";
        at = slot.scheduledAt;
        slotId = slot.slotId;
      } else {
        at = target.at;
      }
      const res = await reschedulePost(p.id, at, slotId ? { queueSlotId: slotId } : undefined);
      if (!res.success) return res.error;
      if (p.scheduledAt) {
        previous.push({ id: p.id, at: p.scheduledAt, slotId: p.queueSlotId ?? null });
      }
      return null;
    },
  );
  return { ...outcome, previous };
}

/** Undo for reschedulePosts: put each post back at its old time and queue slot. */
export function restoreSchedule(previous: PreviousSchedule[]): Promise<BatchOutcome> {
  return runEach(
    previous.map((p) => p.id),
    async (id) => {
      const prev = previous.find((p) => p.id === id)!;
      const res = await reschedulePost(
        prev.id,
        prev.at,
        prev.slotId ? { queueSlotId: prev.slotId } : undefined,
      );
      return res.success ? null : res.error;
    },
  );
}

/** Unschedule: scheduled → draft, keeping caption, accounts, media and settings. */
export function moveToDrafts(posts: PostRef[]): Promise<BatchOutcome> {
  return runEach(
    posts.map((p) => p.id),
    async (id) => {
      const p = posts.find((x) => x.id === id)!;
      if (p.status !== "scheduled") return "Only scheduled posts can move to drafts.";
      if (!p.originalContent?.trim()) return "Posts without a caption can't move to drafts.";
      if (p.accountIds.length === 0) return "This post has no accounts.";
      const res = await updatePost(p.id, p.originalContent, p.accountIds, null, p.mediaIds);
      return res.success ? null : res.error;
    },
  );
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export type PublishCounts = { published: number; failed: number; error: string | null };

/**
 * Publish a post now, or retry one publication (`publicationId`). Polls the
 * publication rows when the server returns before they settle (CF / slow paths).
 * Never throws: a failed request comes back as `error` so callers can toast it.
 */
export async function publishNow(
  postId: string,
  publicationId?: string,
): Promise<PublishCounts> {
  let result: Awaited<ReturnType<typeof publishPost>>;
  try {
    result = await publishPost(postId, undefined, publicationId);
  } catch (e) {
    return {
      published: 0,
      failed: 0,
      error:
        e instanceof Error && e.message
          ? e.message
          : "Couldn't reach Social0 to publish. Check your connection and try again.",
    };
  }
  if (result.error) return { published: 0, failed: 0, error: result.error };
  let published = result.results.filter((r) => r.status === "published").length;
  let failed = result.results.filter((r) => r.status === "failed").length;
  if (result.results.length === 0) {
    let rows: PublicationProgressRow[] = [];
    try {
      await pollPublicationProgressUntilDone(postId, (next) => {
        rows = next;
      });
    } catch {
      // The publish already started; only the status check failed. Report it
      // as started ("Refreshing status…") and let the list refetch.
      return { published: 0, failed: 0, error: null };
    }
    const scoped = publicationId ? rows.filter((r) => r.publicationId === publicationId) : rows;
    published = scoped.filter((r) => r.publicationStatus === "published").length;
    failed = scoped.filter((r) => r.publicationStatus === "failed").length;
  }
  return { published, failed, error: null };
}

/** Retry several failed publications one after another. Never throws. */
export async function retryPublications(
  postId: string,
  publicationIds: string[],
): Promise<PublishCounts> {
  let published = 0;
  let failed = 0;
  let error: string | null = null;
  for (const id of publicationIds) {
    const r = await publishNow(postId, id);
    if (r.error) {
      error = r.error;
      failed += 1;
      continue;
    }
    published += r.published;
    failed += r.failed;
  }
  return { published, failed, error };
}

/** Toast copy after a publish / retry. */
export function publishToast(r: PublishCounts): {
  tone: "success" | "warning" | "error" | "message";
  message: string;
  description?: string;
} {
  if (r.error) return { tone: "error", message: r.error };
  if (r.published + r.failed === 0) {
    return { tone: "message", message: "Publish started", description: "Refreshing status…" };
  }
  if (r.failed === 0) {
    return {
      tone: "success",
      message: r.published === 1 ? "Published" : `Published to ${r.published} accounts`,
    };
  }
  if (r.published === 0) {
    return {
      tone: "error",
      message: "Publishing failed",
      description: "Deliveries on the post shows why and how to fix it.",
    };
  }
  return {
    tone: "warning",
    message: "Partly published",
    description: `${r.published} succeeded, ${r.failed} failed.`,
  };
}
