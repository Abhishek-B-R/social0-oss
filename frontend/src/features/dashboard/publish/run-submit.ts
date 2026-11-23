import type { QueryClient } from "@tanstack/react-query";
import type { PostHog } from "posthog-js";
import {
  createPost,
  updateAndPublish,
  updateDraft,
  updatePost,
  type PublishMode,
} from "@/api/posts";
import { createAutoPlug, createResurfaceSchedule } from "@/api/resurface";
import { uploadFile } from "@/lib/upload-file";
import { capturePostLifecycle } from "@/lib/posthog-events";
import { sortBySlowPlatformsLast } from "@/lib/publish-order";
import { localId } from "@/features/dashboard/composer/media-intake";
import {
  buildMetadata,
  contentFor,
  needsPublishOptions,
  publishOptionsFor,
  publishableParts,
} from "@/features/dashboard/composer/payload";
import type {
  ComposerAccount,
  ComposerContentType,
  ComposerDraft,
  ComposerMode,
  SubmitAction,
} from "@/features/dashboard/composer/types";
import { addTrayJob, updateTrayJob, type TrayRow } from "./publish-store";
import { trackPublish } from "./track-publish";

export type SubmitRequest = {
  action: SubmitAction;
  mode: ComposerMode;
  draft: ComposerDraft;
  type: ComposerContentType;
  /** Accounts this submit goes to (issues already filtered out). */
  accounts: ComposerAccount[];
  scheduledAt: Date | null;
  queueSlotId: string | null;
  scheduledLabel?: string;
  basePath: string;
  queryClient: QueryClient;
  posthog: PostHog | null | undefined;
  /** Put the content back into a composer (save failed). */
  reopen: () => void;
  /** Settle this first (an autosave already in flight). */
  waitFor?: Promise<unknown> | null;
};

type SaveResult =
  | { ok: true; postId: string; streamUrl?: string | null; queued: boolean }
  | { ok: false; error: string };

function firstLine(draft: ComposerDraft): string {
  const t = (draft.parts[0]?.text ?? "").trim().split("\n")[0] ?? "";
  if (t) return t.length > 60 ? `${t.slice(0, 57)}…` : t;
  const media = draft.parts[0]?.media.length ?? 0;
  return media > 0 ? `${media} attachment${media === 1 ? "" : "s"}` : "New post";
}

function handleFor(a: ComposerAccount): string {
  const n = a.platformUsername?.trim();
  if (!n) return a.platform;
  return a.platform === "tiktok" && /\s/.test(n) ? n : `@${n}`;
}

/**
 * Upload media, save the post, and (for publish now) follow it to the end,
 * all outside React so the composer can close right away. Progress and
 * failures live in the PublishTray.
 */
export async function runSubmit(req: SubmitRequest): Promise<void> {
  const { draft, type, accounts, action } = req;
  const jobId = localId("job");
  const parts = publishableParts(draft);
  const uploads = parts.flatMap((p, partIndex) =>
    p.media
      .map((m, mediaIndex) => ({ m, partIndex, mediaIndex }))
      .filter((x) => !x.m.existingId && x.m.file),
  );
  const rows: TrayRow[] = sortBySlowPlatformsLast(accounts).map((a) => ({
    accountId: a.id,
    platform: a.platform,
    handle: handleFor(a),
    status: "waiting",
  }));
  const kind = action === "draft" ? "draft" : action === "now" ? "now" : action === "queue" ? "queue" : "scheduled";

  addTrayJob({
    id: jobId,
    title: firstLine(draft),
    kind,
    phase: uploads.length > 0 ? "uploading" : "saving",
    uploadPercent: uploads.length > 0 ? 0 : null,
    postId: req.mode.kind === "new" || req.mode.kind === "edit" ? null : req.mode.postId,
    scheduledLabel: req.scheduledLabel,
    queueAt:
      req.queueSlotId && req.scheduledAt && (action === "queue" || action === "schedule")
        ? req.scheduledAt.toISOString()
        : undefined,
    rows,
    createdAt: Date.now(),
    basePath: req.basePath,
  });

  const fail = (error: string) => {
    updateTrayJob(jobId, {
      phase: "failed",
      error,
      cancel: undefined,
      reopen: req.reopen,
    });
  };

  // ---- upload ------------------------------------------------------------
  const ids: (string | null)[][] = parts.map((p) => p.media.map((m) => m.existingId ?? null));
  if (uploads.length > 0) {
    const controller = new AbortController();
    updateTrayJob(jobId, { cancel: () => controller.abort() });
    const progress = new Array<number>(uploads.length).fill(0);
    const results = await Promise.allSettled(
      uploads.map((u, i) =>
        uploadFile(
          u.m.file!,
          i,
          (idx, percent) => {
            progress[idx] = percent;
            const avg = Math.round(progress.reduce((a, b) => a + b, 0) / progress.length);
            updateTrayJob(jobId, { uploadPercent: avg });
          },
          // Large videos take longer than the 60s default.
          { signal: controller.signal, timeoutMs: u.m.kind === "video" ? 15 * 60_000 : 120_000 },
        ),
      ),
    );
    if (controller.signal.aborted) {
      fail("Upload canceled. Nothing was posted.");
      return;
    }
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (rejected) {
      const reason = rejected.reason;
      fail(
        reason instanceof Error
          ? `Upload failed: ${reason.message}`
          : "Upload failed. Check your connection and try again.",
      );
      return;
    }
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const u = uploads[i]!;
      ids[u.partIndex]![u.mediaIndex] = r.value.id;
    });
  }
  const partMediaIds = ids.map((list) => list.filter((x): x is string => !!x));
  const mediaIds = partMediaIds.flat();
  updateTrayJob(jobId, { phase: "saving", uploadPercent: null, cancel: undefined });

  // ---- save ----------------------------------------------------------------
  const content = contentFor(draft, type);
  const accountIds = accounts.map((a) => a.id);
  const metadata = buildMetadata({ draft, type, accounts, partMediaIds, action });
  const at = action === "schedule" || action === "queue" ? req.scheduledAt : null;
  const slot = at ? (req.queueSlotId ?? undefined) : undefined;

  if (req.waitFor) await req.waitFor.catch(() => undefined);

  let saved: SaveResult;
  try {
    saved = await save(req, { content, accountIds, mediaIds, metadata, at, slot });
  } catch (err) {
    saved = {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save the post. Try again.",
    };
  }
  if (!saved.ok) {
    fail(saved.error);
    return;
  }

  const postId = saved.postId;
  updateTrayJob(jobId, { postId });
  void req.queryClient.invalidateQueries();

  if (action !== "now") {
    capturePostLifecycle(
      req.posthog,
      action === "draft" ? "post_drafted" : "post_scheduled",
      type,
      accountIds.length,
    );
    // The card dismisses itself (and stays while hovered): see PublishTray.
    updateTrayJob(jobId, { phase: "done" });
    return;
  }

  // ---- publish now ---------------------------------------------------------
  updateTrayJob(jobId, { phase: "publishing" });
  const publishWith = saved.queued
    ? undefined
    : needsPublishOptions(draft, type, accounts)
      ? publishOptionsFor(draft, type, accounts)
      : {};
  const xAccount = accounts.find((a) => a.platform === "twitter_x");
  const finalRows = await trackPublish({
    jobId,
    postId,
    streamUrl: saved.streamUrl,
    publishWith,
    // Auto-repost / auto-plug need the final X status even if the card is dismissed.
    keepAfterDismiss: !!xAccount && !!(draft.autoRepost || draft.autoPlug),
  });
  capturePostLifecycle(req.posthog, "post_published", type, accountIds.length);

  // Auto-repost / auto-plug attach to the live X post (old forms did this
  // after publishing finished).
  const xRow = xAccount ? finalRows.find((r) => r.accountId === xAccount.id) : null;
  const notes: string[] = [];
  if (xAccount && xRow?.status === "published") {
    if (draft.autoRepost) {
      try {
        await createResurfaceSchedule(
          postId,
          "x",
          draft.autoRepost.intervalHours,
          draft.autoRepost.maxResurfaces,
          draft.autoRepost.plugComment?.trim() || null,
        );
      } catch {
        notes.push("Auto-repost couldn't be set up. Turn it on from the post page.");
      }
    }
    if (draft.autoPlug) {
      try {
        const res = await createAutoPlug(postId, xAccount.id, draft.autoPlug);
        if (!res.success) notes.push(`Auto-plug: ${res.error}`);
      } catch {
        notes.push("Auto-plug couldn't be set up. Turn it on from the post page.");
      }
    }
  } else if (xAccount && (draft.autoRepost || draft.autoPlug)) {
    notes.push("Auto-repost and auto-plug start once the X post is live.");
  }
  if (notes.length > 0) {
    updateTrayJob(jobId, (j) => ({ notes: [...(j.notes ?? []), ...notes] }));
  }
  void req.queryClient.invalidateQueries();
}

async function save(
  req: SubmitRequest,
  p: {
    content: string;
    accountIds: string[];
    mediaIds: string[];
    metadata: Record<string, unknown>;
    at: Date | null;
    slot: string | undefined;
  },
): Promise<SaveResult> {
  const { action, mode } = req;
  if (mode.kind === "draft" || mode.kind === "scheduled") {
    const id = mode.postId;
    if (action === "draft") {
      const r = await updateDraft(id, p.content, p.accountIds, p.mediaIds, p.metadata);
      return r.success ? { ok: true, postId: id, queued: false } : { ok: false, error: r.error };
    }
    if (action === "now") {
      const r = await updateAndPublish(id, p.content, p.accountIds, p.mediaIds, p.metadata);
      if (!r.success) return { ok: false, error: r.error };
      return {
        ok: true,
        postId: r.postId,
        streamUrl: r.streamUrl ?? null,
        // updateAndPublish always enqueues on the server.
        queued: r.queued ?? true,
      };
    }
    const r = await updatePost(id, p.content, p.accountIds, p.at, p.mediaIds, p.metadata, p.slot);
    return r.success ? { ok: true, postId: id, queued: false } : { ok: false, error: r.error };
  }

  const publishMode: PublishMode =
    action === "draft" ? "draft" : action === "now" ? "now" : "scheduled";
  const r = await createPost(
    p.content,
    p.accountIds,
    publishMode,
    p.at,
    p.mediaIds,
    p.metadata,
    publishMode === "scheduled" ? p.slot : undefined,
  );
  if (!r.success) return { ok: false, error: r.error };
  return {
    ok: true,
    postId: r.postId,
    streamUrl: r.streamUrl ?? null,
    queued: !!r.queued,
  };
}
