import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listInboxDms,
  replyToInboxDm,
  type InboxDmListResult,
  type InboxDmThread,
  type InboxDmThreadResult,
  type LocalInboxDmMessage,
} from "@/api/inbox";
import type { DateWindow } from "@/lib/date-window";
import {
  initialInboxPageParam,
  refreshInboxInfiniteFirstPage,
  type InboxPageParam,
} from "@/lib/inbox-infinite";
import { uploadFile } from "@/lib/upload-file";
import type { InboxComposerPayload } from "./InboxComposer";
import { dmItemKey } from "./inbox-items";
import { dmThreadQueryKey, fetchDmThread } from "./use-inbox-feed";

function attachmentFromPreview(
  file: File | null | undefined,
  previewUrl: string | null | undefined,
): LocalInboxDmMessage["attachment"] {
  if (!file || !previewUrl) return null;
  return { type: file.type.startsWith("video/") ? "video" : "image", url: previewUrl };
}

/** Instagram and TikTok send an image and its caption as two messages. */
function dmSplitsImageCaption(platform: string): boolean {
  return platform === "instagram" || platform === "tiktok";
}

export function sameLocalDm(server: LocalInboxDmMessage, local: LocalInboxDmMessage): boolean {
  if (server.id && local.id && server.id === local.id) return true;
  if (local.sendStatus === "failed" || local.sendStatus === "sending") return false;
  if (!server.isOwn || !local.isOwn) return false;
  const dt = Math.abs(
    new Date(server.createdAt ?? 0).getTime() - new Date(local.createdAt ?? 0).getTime(),
  );
  if (dt > 120_000) return false;
  // IG/TikTok send image then caption as two rows. Drop the combo pending
  // once either half is on the server.
  if (local.attachment && local.text) {
    if (server.attachment && server.attachment.type === local.attachment.type && dt < 15_000) {
      return true;
    }
    return !server.attachment && server.text === local.text;
  }
  if (local.attachment || server.attachment) {
    return (
      Boolean(server.attachment) &&
      Boolean(local.attachment) &&
      server.attachment!.type === local.attachment!.type &&
      server.text === local.text &&
      dt < 15_000
    );
  }
  return Boolean(local.text) && server.text === local.text;
}

/** Server messages plus local ones the server hasn't returned yet, oldest first. */
export function mergeDmMessages(
  server: LocalInboxDmMessage[],
  pending: LocalInboxDmMessage[],
): LocalInboxDmMessage[] {
  const used = new Set<number>();
  const extra = pending.filter((local) => {
    if (local.sendStatus === "failed" || local.sendStatus === "sending") return true;
    const byId = server.findIndex((s, i) => !used.has(i) && s.id && local.id && s.id === local.id);
    if (byId >= 0) {
      used.add(byId);
      return false;
    }
    const byHeuristic = server.findIndex((s, i) => !used.has(i) && sameLocalDm(s, local));
    if (byHeuristic >= 0) {
      used.add(byHeuristic);
      return false;
    }
    return true;
  });
  return [...server, ...extra].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/**
 * DM sends from the inbox: optimistic bubbles, failed + retry (re-using an
 * uploaded attachment), and a delayed re-read so the server copy replaces
 * the local one. Page-level so pending bubbles survive switching threads.
 */
export function useDmSender({
  workspaceId,
  dmsKey,
  dateWindow,
  accountId,
  onSent,
  onServerConfirmed,
}: {
  workspaceId: string;
  dmsKey: readonly unknown[];
  dateWindow: DateWindow;
  accountId: string | null;
  /** Called after the platform accepted the message (item key, sent time). */
  onSent?: (itemKey: string, sentAt: string) => void;
  /**
   * The re-read after a send found that message as the thread's newest, with
   * the server's own time for it (item key, server time). Runs whether or not
   * the thread is open.
   */
  onServerConfirmed?: (itemKey: string, serverAt: string) => void;
}) {
  const qc = useQueryClient();
  const [pendingByConvo, setPendingByConvo] = useState<Record<string, LocalInboxDmMessage[]>>({});
  const pendingRef = useRef(pendingByConvo);
  useEffect(() => {
    pendingRef.current = pendingByConvo;
  }, [pendingByConvo]);
  /** Post-send re-read per conversation, so a send elsewhere doesn't cancel it. */
  const refreshTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = refreshTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const updatePending = useCallback(
    (key: string, updater: (prev: LocalInboxDmMessage[]) => LocalInboxDmMessage[]) => {
      setPendingByConvo((prev) => ({ ...prev, [key]: updater(prev[key] ?? []) }));
    },
    [],
  );

  const sendMessage = useCallback(
    async (
      thread: InboxDmThread,
      payload: InboxComposerPayload,
      opts?: { clientId?: string },
    ): Promise<boolean> => {
      const key = dmItemKey(thread);
      const threadKey = dmThreadQueryKey(workspaceId, thread);
      const clientId = opts?.clientId ?? `local-${Date.now()}`;
      const createdAt = new Date().toISOString();
      const markFailed = (message: string) => {
        updatePending(key, (prev) =>
          prev.map((m) => (m.id === clientId ? { ...m, sendStatus: "failed" as const } : m)),
        );
        toast.error(`Message not sent: ${message}`, {
          description: "Retry from the failed message in the conversation.",
        });
      };

      if (!opts?.clientId) {
        const optimistic: LocalInboxDmMessage = {
          id: clientId,
          text: payload.text,
          createdAt,
          isOwn: true,
          authorName: "You",
          authorHandle: thread.accountLabel,
          authorAvatarUrl: thread.accountProfileImageUrl ?? null,
          attachment: attachmentFromPreview(payload.file, payload.previewUrl),
          sendStatus: "sending",
          localPreviewUrl: payload.previewUrl,
          retryPayload: {
            text: payload.text,
            file: payload.file ?? undefined,
            previewUrl: payload.previewUrl,
          },
        };
        updatePending(key, (prev) => [...prev, optimistic]);
      } else {
        updatePending(key, (prev) =>
          prev.map((m) => (m.id === clientId ? { ...m, sendStatus: "sending" as const } : m)),
        );
      }

      try {
        let mediaId: string | undefined;
        if (opts?.clientId) {
          mediaId = pendingRef.current[key]?.find((m) => m.id === clientId)?.retryPayload?.mediaId;
        }
        if (payload.file && !mediaId) {
          const uploaded = await uploadFile(payload.file, 0);
          mediaId = uploaded.id;
          updatePending(key, (prev) =>
            prev.map((m) =>
              m.id === clientId && m.retryPayload
                ? { ...m, retryPayload: { ...m.retryPayload, mediaId } }
                : m,
            ),
          );
        }
        if (!payload.text.trim() && !mediaId) {
          markFailed("add a message or attachment");
          return false;
        }
        const res = await replyToInboxDm({
          accountId: thread.accountId,
          conversationId: thread.conversationId,
          peerId: thread.peerId,
          text: payload.text,
          mediaId,
        });
        if (!res.ok) {
          markFailed(res.error);
          return false;
        }
        // The platform timestamps the message after the upload and this
        // round trip, so "sent" is now, not when the send started.
        const sentAt = new Date().toISOString();
        updatePending(key, (prev) =>
          prev.map((m) =>
            m.id === clientId ? { ...m, id: res.messageId ?? clientId, sendStatus: undefined } : m,
          ),
        );
        // Only a delivered message becomes the row's preview and activity
        // time: a failed send must not look like the latest message.
        qc.setQueryData<InfiniteData<InboxDmListResult, InboxPageParam>>(dmsKey, (old) => {
          if (!old) return old;
          const snippet =
            payload.text || (payload.file?.type.startsWith("video/") ? "[video]" : "[image]");
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              threads: page.threads.map((t) =>
                dmItemKey(t) === key ? { ...t, snippet, lastMessageAt: sentAt } : t,
              ),
            })),
          };
        });
        const confirmed: LocalInboxDmMessage = {
          id: res.messageId ?? clientId,
          text: payload.text,
          createdAt: sentAt,
          isOwn: true,
          authorName: "You",
          authorHandle: thread.accountLabel,
          authorAvatarUrl: thread.accountProfileImageUrl ?? null,
          attachment: attachmentFromPreview(payload.file, payload.previewUrl),
          sentHere: true,
        };
        if (!(dmSplitsImageCaption(thread.platform) && payload.file && payload.text.trim())) {
          qc.setQueryData<InboxDmThreadResult>(threadKey, (old) => {
            if (!old) return old;
            if (old.messages.some((m) => sameLocalDm(m, confirmed))) return old;
            return { ...old, messages: [...old.messages, confirmed] };
          });
        }
        onSent?.(key, sentAt);
        const prevTimer = refreshTimers.current.get(key);
        if (prevTimer) clearTimeout(prevTimer);
        const timer = setTimeout(() => {
          refreshTimers.current.delete(key);
          // Re-read the thread even when its pane is closed (an inactive
          // query would not refetch on invalidate), so the server's time for
          // this message replaces the provisional handled mark.
          void qc
            .fetchQuery({ queryKey: threadKey, queryFn: () => fetchDmThread(thread) })
            .then((result) => {
              const newest = result.messages.reduce<(typeof result.messages)[number] | undefined>(
                (latest, m) =>
                  !latest || (m.createdAt ?? "").localeCompare(latest.createdAt ?? "") >= 0
                    ? m
                    : latest,
                undefined,
              );
              if (newest?.isOwn && newest.createdAt && sameLocalDm(newest, confirmed)) {
                onServerConfirmed?.(key, newest.createdAt);
              }
            })
            .catch(() => undefined);
          void refreshInboxInfiniteFirstPage(qc, dmsKey, () =>
            listInboxDms({
              ...initialInboxPageParam(dateWindow),
              accountId: accountId || undefined,
            }),
          );
        }, 8000);
        refreshTimers.current.set(key, timer);
        return true;
      } catch (e) {
        markFailed(e instanceof Error ? e.message : "something went wrong");
        return false;
      }
    },
    [accountId, dateWindow, dmsKey, onSent, onServerConfirmed, qc, updatePending, workspaceId],
  );

  const retryMessage = useCallback(
    (thread: InboxDmThread, message: LocalInboxDmMessage) => {
      const rp = message.retryPayload;
      if (!rp) return;
      void sendMessage(
        thread,
        { text: rp.text, file: rp.file ?? null, previewUrl: rp.previewUrl },
        { clientId: message.id },
      );
    },
    [sendMessage],
  );

  const pendingFor = useCallback(
    (thread: Pick<InboxDmThread, "accountId" | "conversationId"> | null) =>
      thread ? (pendingByConvo[dmItemKey(thread)] ?? EMPTY) : EMPTY,
    [pendingByConvo],
  );

  return { sendMessage, retryMessage, pendingFor };
}

const EMPTY: LocalInboxDmMessage[] = [];
