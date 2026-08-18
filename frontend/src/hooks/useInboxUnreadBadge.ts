import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { listInboxComments, listInboxDms } from "@/api/inbox";
import { getDashboardRelativePath } from "@/lib/dashboard-base-path";
import { defaultDateWindow, windowQueryParams } from "@/lib/date-window";
import { useSession } from "@/lib/auth-client";
import {
  countInboxUnread,
  inboxDmFingerprint,
  loadInboxSeen,
  mergeInboxSeen,
  saveInboxSeen,
  subscribeInboxSeen,
} from "@/lib/inbox-unread";

const POLL_MS = 120_000;
const WINDOW = defaultDateWindow();

function commentIdsFrom(threads: Array<{ comment: { id: string; isOwn?: boolean }; replies: Array<{ id: string; isOwn?: boolean }> }>): string[] {
  const ids: string[] = [];
  for (const t of threads) {
    if (!t.comment.isOwn) ids.push(t.comment.id);
    for (const r of t.replies) {
      if (!r.isOwn) ids.push(r.id);
    }
  }
  return ids;
}

export function useInboxUnreadBadge(): number {
  const { data: session } = useSession();
  const enabled = Boolean(session);
  const relative = getDashboardRelativePath(useLocation().pathname);
  const onInbox = relative === "inbox" || relative.startsWith("inbox/");
  const seenRev = useSyncExternalStore(
    subscribeInboxSeen,
    () => {
      const s = loadInboxSeen();
      return `${s.seeded}:${s.comments.length}:${s.dms.length}:${s.comments[s.comments.length - 1] ?? ""}:${s.dms[s.dms.length - 1] ?? ""}`;
    },
    () => "ssr",
  );

  const commentsQuery = useQuery({
    queryKey: ["inbox-comments", WINDOW, null],
    queryFn: () => listInboxComments({ ...windowQueryParams(WINDOW) }),
    enabled: enabled && !onInbox,
    staleTime: 60_000,
    refetchInterval: enabled && !onInbox ? POLL_MS : false,
    refetchIntervalInBackground: false,
  });

  const dmsQuery = useQuery({
    queryKey: ["inbox-dms", WINDOW, null],
    queryFn: () => listInboxDms({ ...windowQueryParams(WINDOW) }),
    enabled: enabled && !onInbox,
    staleTime: 60_000,
    refetchInterval: enabled && !onInbox ? POLL_MS : false,
    refetchIntervalInBackground: false,
  });

  const commentIds = useMemo(
    () => commentIdsFrom(commentsQuery.data?.threads ?? []),
    [commentsQuery.data],
  );
  const dmIds = useMemo(
    () =>
      (dmsQuery.data?.threads ?? []).map((t) =>
        inboxDmFingerprint(t.accountId, t.conversationId, t.lastMessageAt),
      ),
    [dmsQuery.data],
  );

  useEffect(() => {
    if (!enabled) return;
    if (!commentsQuery.data && !dmsQuery.data) return;
    const seen = loadInboxSeen();
    if (!seen.seeded || onInbox) {
      saveInboxSeen(mergeInboxSeen(seen, commentIds, dmIds));
    }
  }, [enabled, onInbox, commentsQuery.data, dmsQuery.data, commentIds, dmIds]);

  return useMemo(() => {
    void seenRev;
    if (onInbox) return 0;
    return countInboxUnread(loadInboxSeen(), commentIds, dmIds);
  }, [seenRev, onInbox, commentIds, dmIds]);
}
