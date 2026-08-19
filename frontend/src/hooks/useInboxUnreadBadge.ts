import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { listInboxComments, listInboxDms } from "@/api/inbox";
import { getDashboardRelativePath } from "@/lib/dashboard-base-path";
import { defaultDateWindow, windowQueryParams } from "@/lib/date-window";
import { useSession } from "@/lib/auth-client";
import { listWorkspaces } from "@/api/team";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";
import {
  countInboxUnread,
  inboxDmFingerprint,
  loadInboxSeen,
  mergeInboxSeen,
  saveInboxSeen,
  subscribeInboxSeen,
  commentIdsFromThreads,
} from "@/lib/inbox-unread";

const POLL_MS = 120_000;
const WINDOW = defaultDateWindow();

export function useInboxUnreadBadge(): number {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { canViewInbox } = useWorkspaceNavPermissions();
  const workspacesQuery = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    enabled: Boolean(session),
  });
  const workspaceReady = workspacesQuery.isSuccess || workspacesQuery.isError;
  const workspaceId =
    workspacesQuery.data?.workspaces.find((w) => w.isActive)?.id ?? "main";
  const enabled = Boolean(session) && canViewInbox && workspaceReady;
  const relative = getDashboardRelativePath(useLocation().pathname);
  const onInbox = relative === "inbox" || relative.startsWith("inbox/");
  const subscribe = useCallback(
    (onChange: () => void) => subscribeInboxSeen(userId, onChange),
    [userId],
  );
  const seenRev = useSyncExternalStore(
    subscribe,
    () => {
      const s = loadInboxSeen(userId);
      return `${s.seeded}:${s.comments.length}:${s.dms.length}:${s.comments[s.comments.length - 1] ?? ""}:${s.dms[s.dms.length - 1] ?? ""}`;
    },
    () => "ssr",
  );

  const commentsQuery = useQuery({
    queryKey: ["inbox-comments", workspaceId, WINDOW, null],
    queryFn: () => listInboxComments({ ...windowQueryParams(WINDOW) }),
    enabled: enabled && !onInbox,
    staleTime: 60_000,
    refetchInterval: enabled && !onInbox ? POLL_MS : false,
    refetchIntervalInBackground: false,
  });

  const dmsQuery = useQuery({
    queryKey: ["inbox-dms", workspaceId, WINDOW, null],
    queryFn: () => listInboxDms({ ...windowQueryParams(WINDOW) }),
    enabled: enabled && !onInbox,
    staleTime: 60_000,
    refetchInterval: enabled && !onInbox ? POLL_MS : false,
    refetchIntervalInBackground: false,
  });

  const commentIds = useMemo(
    () => commentIdsFromThreads(commentsQuery.data?.threads ?? []),
    [commentsQuery.data],
  );
  const dmIds = useMemo(
    () =>
      (dmsQuery.data?.threads ?? []).map((t) =>
        inboxDmFingerprint(t.accountId, t.conversationId),
      ),
    [dmsQuery.data],
  );

  useEffect(() => {
    if (!enabled || onInbox) return;
    if (!commentsQuery.data && !dmsQuery.data) return;
    const seen = loadInboxSeen(userId);
    if (!seen.seeded) {
      saveInboxSeen(userId, mergeInboxSeen(seen, commentIds, dmIds));
    }
  }, [enabled, onInbox, commentsQuery.data, dmsQuery.data, commentIds, dmIds, userId]);

  return useMemo(() => {
    void seenRev;
    if (onInbox) return 0;
    return countInboxUnread(loadInboxSeen(userId), commentIds, dmIds);
  }, [seenRev, onInbox, commentIds, dmIds, userId]);
}
