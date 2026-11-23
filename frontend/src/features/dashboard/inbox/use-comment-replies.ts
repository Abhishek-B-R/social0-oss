import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  replyToInboxComment,
  type InboxAccount,
  type InboxComment,
  type InboxThread,
} from "@/api/inbox";
import { inboxReplyTargetId, inboxReplyTextsMatch } from "@/lib/inbox-reply";
import { uploadFile } from "@/lib/upload-file";
import type { InboxComposerPayload } from "./InboxComposer";

type RetryPayload = InboxComposerPayload & { parentCommentId: string };

function replyLooksSent(
  server: InboxComment,
  pending: InboxComment,
  platform: string,
): boolean {
  if (server.id === pending.id) return true;
  if (!server.isOwn) return false;
  if (
    !inboxReplyTextsMatch(
      platform,
      server.text || "",
      pending.text || "",
      pending.authorHandle ?? server.authorHandle,
    )
  ) {
    return false;
  }
  const dt = Math.abs(
    new Date(server.createdAt ?? 0).getTime() -
      new Date(pending.createdAt ?? 0).getTime(),
  );
  return dt < 120_000;
}

/** Add optimistic replies that the server copy hasn't caught up with yet. */
export function mergePendingReplies(
  threads: InboxThread[],
  pending: InboxComment[],
): InboxThread[] {
  if (!pending.length) return threads;
  return threads.map((thread) => {
    const extras = pending.filter((p) => {
      if (p.publicationId !== thread.comment.publicationId) return false;
      const inThread =
        thread.comment.id === p.parentId ||
        thread.replies.some((r) => r.id === p.parentId);
      if (!inThread) return false;
      if (thread.replies.some((r) => replyLooksSent(r, p, thread.comment.platform))) return false;
      if (replyLooksSent(thread.comment, p, thread.comment.platform)) return false;
      return true;
    });
    return extras.length ? { ...thread, replies: [...thread.replies, ...extras] } : thread;
  });
}

/**
 * Comment replies sent from the inbox: optimistic rows, sending/failed
 * state and retry. Lives at page level so switching threads keeps them.
 */
export function useCommentReplies(accounts: InboxAccount[]) {
  const [pendingReplies, setPendingReplies] = useState<InboxComment[]>([]);
  const [failedReplyIds, setFailedReplyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [sendingReplyIds, setSendingReplyIds] = useState<ReadonlySet<string>>(() => new Set());
  const retryPayloads = useRef(new Map<string, RetryPayload>());

  const sendReply = useCallback(
    async (
      thread: InboxThread,
      uiParentId: string,
      payload: InboxComposerPayload,
      opts?: { optimisticId?: string },
    ): Promise<boolean> => {
      const root = thread.comment;
      const apiCommentId = inboxReplyTargetId(root.platform, root.id, uiParentId);
      // Date.now() only builds a client-side id here (event handler, not render).
      const optimisticId = opts?.optimisticId ?? `optimistic-${Date.now()}`;
      const account = accounts.find((a) => a.id === root.accountId);

      if (!opts?.optimisticId) {
        retryPayloads.current.set(optimisticId, { ...payload, parentCommentId: uiParentId });
        const attachment =
          payload.file && payload.previewUrl
            ? {
                type: (payload.file.type.startsWith("video/") ? "video" : "image") as
                  | "image"
                  | "video",
                url: payload.previewUrl,
              }
            : null;
        const next: InboxComment = {
          id: optimisticId,
          platform: root.platform,
          accountId: root.accountId,
          accountLabel: account?.username ?? root.accountLabel,
          postId: root.postId,
          publicationId: root.publicationId,
          platformPostId: root.platformPostId,
          platformPostUrl: root.platformPostUrl,
          postSnippet: root.postSnippet,
          postContent: root.postContent,
          postMediaUrl: root.postMediaUrl,
          postPublishedAt: root.postPublishedAt,
          postAccountImageUrl: root.postAccountImageUrl,
          authorName: "You",
          authorHandle: account?.username ?? root.accountLabel ?? null,
          authorAvatarUrl: account?.profileImageUrl,
          text: payload.text,
          attachment,
          createdAt: new Date().toISOString(),
          parentId: uiParentId,
          canReply: false,
          isOwn: true,
        };
        setPendingReplies((p) => [...p, next]);
      }
      setSendingReplyIds((s) => new Set(s).add(optimisticId));
      setFailedReplyIds((s) => {
        if (!s.has(optimisticId)) return s;
        const next = new Set(s);
        next.delete(optimisticId);
        return next;
      });

      const fail = (message: string) => {
        setFailedReplyIds((s) => new Set(s).add(optimisticId));
        toast.error(`Reply not sent: ${message}`, {
          description: "Retry from the failed reply in the thread.",
        });
      };

      try {
        let mediaId: string | undefined;
        if (payload.file) {
          const uploaded = await uploadFile(payload.file, 0);
          mediaId = uploaded.id;
        }
        const res = await replyToInboxComment({
          publicationId: root.publicationId,
          commentId: apiCommentId,
          text: payload.text,
          mediaId,
        });
        if (!res.ok) {
          fail(res.error);
          return false;
        }
        retryPayloads.current.delete(optimisticId);
        setPendingReplies((p) =>
          p.map((r) => (r.id === optimisticId ? { ...r, id: res.replyId ?? r.id } : r)),
        );
        return true;
      } catch (e) {
        fail(e instanceof Error ? e.message : "something went wrong");
        return false;
      } finally {
        setSendingReplyIds((s) => {
          const next = new Set(s);
          next.delete(optimisticId);
          return next;
        });
      }
    },
    [accounts],
  );

  /** Resend a failed optimistic reply inside `threads`. */
  const retryReply = useCallback(
    (optimisticId: string, threads: InboxThread[]) => {
      const stored = retryPayloads.current.get(optimisticId);
      if (!stored) return;
      const { parentCommentId, ...payload } = stored;
      const thread = threads.find(
        (t) =>
          t.comment.id === parentCommentId ||
          t.replies.some((r) => r.id === parentCommentId),
      );
      if (!thread) return;
      void sendReply(thread, parentCommentId, payload, { optimisticId });
    },
    [sendReply],
  );

  return {
    pendingReplies,
    failedReplyIds,
    sendingReplyIds,
    sendReply,
    retryReply,
  };
}
