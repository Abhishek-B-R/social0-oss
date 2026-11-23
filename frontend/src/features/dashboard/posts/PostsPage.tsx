import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import {
  CalendarClock,
  CheckCheck,
  Copy,
  FileInput,
  PenSquare,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import {
  Banner,
  BulkBarButton,
  EmptyState,
  ErrorState,
  FloatingBulkBar,
  getPostSourceFromDto,
  PageContainer,
  PageHeader,
  Skeleton,
  SkeletonRows,
  UrlTabs,
  openComposer,
  useAccountHealth,
  useDashboardPath,
  useHotkeys,
  useRowSelection,
  type AccountWithHealth,
} from "@/components/app";
import { loadPostsPageData } from "@/api/dashboard-data";
import { GuestPostsPageView } from "@/components/dashboard/GuestPostsPageView";
import { Pagination } from "@/components/ui/Pagination";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";
import { useSession } from "@/lib/auth-client";
import { POSTS_TABS, POSTS_TAB_LABELS, type PostsTab } from "@/lib/dashboard-routes";
import { capturePostAction } from "@/lib/posthog-events";
import { cn } from "@/lib/utils";
import { DeletePostsDialog } from "./DeletePostsDialog";
import { useDraftPublishGate } from "./use-draft-publish-gate";
import { usePostAgain } from "./use-post-again";
import { editHref, rowButtonClass } from "./post-links";
import type { RowHandlers } from "./PostRowActions";
import { PostsCards } from "./PostsCards";
import { PostsFilters, PostsSearchBox, type PostsView } from "./PostsFilters";
import { PostsTable } from "./PostsTable";
import { ScheduleDialog } from "./ScheduleDialog";
import {
  deletePosts,
  duplicatePosts,
  moveToDrafts,
  plural,
  publishNow,
  publishToast,
  reschedulePosts,
  restoreSchedule,
  retryPublications,
  scheduleDrafts,
  summarize,
  type BatchOutcome,
  type ScheduleTarget,
} from "./post-actions";
import { listContextFromParams, type PostNavState } from "./post-nav";
import { POSTS_PAGE_SIZE } from "./posts-constants";
import {
  hydratePostsPage,
  parsePostsTab,
  tabCount,
  type PostListItem,
  type TimeOpts,
} from "./posts-model";

const VIEW_STORAGE_KEY = "social0.posts.view";

function readStoredView(): PostsView {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "cards" ? "cards" : "table";
  } catch {
    return "table";
  }
}

function showOutcome(
  outcome: BatchOutcome,
  verb: string,
  action?: { label: string; onClick: () => void },
  suffix?: string,
) {
  const s = summarize(outcome, verb, suffix);
  const opts = { description: s.description, action };
  if (s.tone === "success") toast.success(s.message, opts);
  else if (s.tone === "warning") toast.warning(s.message, opts);
  else toast.error(s.message, { description: s.description });
}

const EMPTY_COPY: Record<PostsTab, { title: string; description: string }> = {
  all: {
    title: "No posts yet",
    description: "Write your first post, or connect an AI agent and let it draft posts for you to review.",
  },
  drafts: { title: "No drafts", description: "Posts you save without scheduling land here." },
  review: {
    title: "Nothing to review",
    description: "Drafts your AI agents and API keys create wait here until you approve them.",
  },
  scheduled: { title: "Nothing scheduled", description: "Scheduled and queued posts show up here." },
  published: { title: "Nothing published yet", description: "Posts appear here once they go live." },
  failed: {
    title: "No failed posts",
    description: "Everything went out. If a network rejects a post, it shows up here with the fix.",
  },
};

function PostsPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading posts">
      <div className="mb-5 flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-9 w-64 rounded-xl" />
      </div>
      <Skeleton className="mb-4 h-8 w-full max-w-xl" />
      <Skeleton className="mb-4 h-8 w-80" />
      <SkeletonRows rows={8} />
    </div>
  );
}

/**
 * Posts (mock 05·A): one page with status tabs + counts, URL filters,
 * search, a dense table (or cards), per-row fixes and bulk actions.
 */
export function PostsPage() {
  const dash = useDashboardPath();
  const navigate = useNavigate();
  const location = useLocation();
  const posthog = usePostHog();
  const invalidate = useInvalidateQueries();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: session, isPending: sessionPending } = useSession();
  const { ready: permsReady, canCreatePosts } = useWorkspaceNavPermissions();
  const readOnly = permsReady && !canCreatePosts;
  const health = useAccountHealth({ enabled: !!session });

  const tab = parsePostsTab(searchParams.get("tab"));
  const list = useMemo(() => listContextFromParams(searchParams), [searchParams]);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const tiktokPublished = searchParams.get("tiktok_published") === "true";

  const [view, setViewState] = useState<PostsView>(readStoredView);
  const setView = (v: PostsView) => {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* storage blocked: keep in memory */
    }
  };

  const query = useQuery({
    queryKey: [
      "posts-page",
      list.statusFilter,
      list.sort,
      list.platform,
      list.time,
      list.account,
      list.query,
      list.source,
      page,
    ],
    queryFn: () =>
      loadPostsPageData({
        statusFilter: list.statusFilter,
        sort: list.sort,
        platform: list.platform,
        time: list.time,
        account: list.account,
        query: list.query,
        source: list.source,
        page,
      }),
    enabled: !!session,
    placeholderData: keepPreviousData,
  });

  const data = query.data?.ok ? query.data.data : null;
  const items = useMemo(() => (data ? hydratePostsPage(data) : []), [data]);
  const sourceOptions = useMemo(
    () =>
      (data?.sourceOptions ?? []).map((o) => ({
        value: o.value,
        label: getPostSourceFromDto(o.source).label,
      })),
    [data?.sourceOptions],
  );

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const selection = useRowSelection(ids);
  const selectedItems = useMemo(
    () => items.filter((i) => selection.isSelected(i.id)),
    [items, selection],
  );

  const healthById = useMemo(() => {
    const m = new Map<string, AccountWithHealth>();
    for (const a of health.accounts) m.set(a.id, a);
    return m;
  }, [health.accounts]);

  const timeOpts: TimeOpts = {
    timezone: data?.timezone ?? null,
    use24HourTimeFormat: data?.use24HourTimeFormat ?? false,
    dateFormat: data?.dateFormat ?? null,
  };

  const from = `${location.pathname}${location.search}`;
  const navState: PostNavState = useMemo(() => ({ from, list }), [from, list]);
  const detailHref = useCallback((item: PostListItem) => dash(`posts/${item.id}`), [dash]);
  const onOpen = useCallback(
    (item: PostListItem) => {
      if (item.uiStatus === "draft" && !item.isAgentDraft && !readOnly) {
        navigate(editHref(dash, item));
        return;
      }
      navigate(dash(`posts/${item.id}`), { state: navState });
    },
    [dash, navigate, navState, readOnly],
  );

  // ---- Mutations -------------------------------------------------------
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const markBusy = (idsToMark: string[], on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of idsToMark) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const [deleteTargets, setDeleteTargets] = useState<PostListItem[] | null>(null);
  const [scheduleTargets, setScheduleTargets] = useState<PostListItem[] | null>(null);
  const [rescheduleTargets, setRescheduleTargets] = useState<PostListItem[] | null>(null);
  const postAgain = usePostAgain("posts_list");
  const draftPublishGate = useDraftPublishGate();

  const afterMutation = () => {
    selection.clear();
    invalidate();
  };

  const handlers: RowHandlers = {
    onRetry: (item, publicationIds) => {
      markBusy([item.id], true);
      void retryPublications(item.id, publicationIds)
        .then((r) => {
          const t = publishToast(r);
          toast[t.tone](t.message, { description: t.description });
          capturePostAction(posthog, "post_published", {
            source: "posts_list_retry",
            platform_count: publicationIds.length,
          });
        })
        .finally(() => {
          markBusy([item.id], false);
          invalidate();
        });
    },
    onPublishNow: (item) => {
      if (draftPublishGate.blocksPublish(item.uiStatus)) return;
      markBusy([item.id], true);
      void publishNow(item.id)
        .then((r) => {
          const t = publishToast(r);
          toast[t.tone](t.message, { description: t.description });
          capturePostAction(posthog, "post_published", {
            source: item.uiStatus === "failed" ? "posts_list_retry" : "posts_list_publish_now",
            post_status: item.uiStatus,
          });
        })
        .finally(() => {
          markBusy([item.id], false);
          invalidate();
        });
    },
    onPostAgain: (item) => void postAgain.run(item.id, { title: item.title }),
    onDuplicate: (targets) => {
      markBusy(targets.map((t) => t.id), true);
      void duplicatePosts(targets)
        .then((res) => {
          capturePostAction(posthog, "post_duplicated", { source: "posts_list", count: res.ok.length });
          const single = res.createdIds.length === 1 && targets.length === 1;
          const action = single
            ? {
                label: "Open",
                onClick: () =>
                  navigate(editHref(dash, { id: res.createdIds[0]!, uiStatus: "draft" })),
              }
            : res.createdIds.length > 0
              ? {
                  label: "Undo",
                  onClick: () => {
                    void deletePosts(res.createdIds).then((undo) => {
                      if (undo.failed.length) toast.error("Couldn't remove every copy. Delete them from Drafts.");
                      else toast.message("Copies removed");
                      invalidate();
                    });
                  },
                }
              : undefined;
          const s = summarize(res, "Duplicated");
          const msg = s.tone === "success" ? `${s.message} as ${res.ok.length === 1 ? "a draft" : "drafts"}` : s.message;
          if (s.tone === "success") toast.success(msg, { action });
          else if (s.tone === "warning") toast.warning(msg, { description: s.description, action });
          else toast.error(msg, { description: s.description });
        })
        .finally(() => {
          markBusy(targets.map((t) => t.id), false);
          afterMutation();
        });
    },
    onDelete: (targets) => setDeleteTargets(targets),
    onSchedule: (targets) => setScheduleTargets(targets),
    onReschedule: (targets) => setRescheduleTargets(targets),
    onMoveToDrafts: (targets) => {
      markBusy(targets.map((t) => t.id), true);
      void moveToDrafts(targets)
        .then((res) => {
          showOutcome(res, "Moved", undefined, " to drafts");
          capturePostAction(posthog, "post_unscheduled", { source: "posts_list", count: res.ok.length });
        })
        .finally(() => {
          markBusy(targets.map((t) => t.id), false);
          afterMutation();
        });
    },
  };

  const confirmDelete = async () => {
    const targets = deleteTargets ?? [];
    const res = await deletePosts(targets.map((t) => t.id));
    showOutcome(res, "Deleted");
    for (const t of targets.filter((x) => res.ok.includes(x.id))) {
      capturePostAction(posthog, t.uiStatus === "scheduled" ? "post_cancelled" : "post_deleted", {
        source: "posts_list",
        post_status: t.uiStatus,
      });
    }
    afterMutation();
  };

  const confirmSchedule = async (target: ScheduleTarget) => {
    const targets = scheduleTargets ?? [];
    const res = await scheduleDrafts(targets, target);
    const agent = targets.every((t) => t.isAgentDraft);
    showOutcome(res, agent ? "Approved and scheduled" : "Scheduled");
    capturePostAction(posthog, agent ? "agent_draft_approved" : "post_scheduled", {
      source: "posts_list",
      count: res.ok.length,
      via: target.kind,
    });
    afterMutation();
  };

  const confirmReschedule = async (target: ScheduleTarget) => {
    const targets = rescheduleTargets ?? [];
    const res = await reschedulePosts(targets, target);
    const previous = res.previous;
    showOutcome(
      res,
      "Rescheduled",
      previous.length > 0
        ? {
            label: "Undo",
            onClick: () => {
              void restoreSchedule(previous).then((undo) => {
                if (undo.failed.length) toast.error("Couldn't move every post back.", { description: undo.failed[0]?.error });
                else toast.message("Moved back");
                invalidate();
              });
            },
          }
        : undefined,
    );
    afterMutation();
  };

  // ---- Keyboard: J/K move between rows, X selects -----------------------
  const moveFocus = (dir: 1 | -1) => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-post-row]"));
    if (rows.length === 0) return;
    const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-post-row]");
    const idx = current ? rows.indexOf(current) : -1;
    const next = rows[Math.max(0, Math.min(rows.length - 1, idx + dir))] ?? rows[0]!;
    const target = next.tabIndex >= 0 ? next : next.querySelector<HTMLElement>("a,button");
    target?.focus();
    next.scrollIntoView({ block: "nearest" });
  };
  useHotkeys(
    [
      { keys: "j", handler: () => moveFocus(1) },
      { keys: "k", handler: () => moveFocus(-1) },
      {
        keys: "x",
        enabled: !readOnly,
        handler: () => {
          const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-post-row]");
          const id = row?.dataset.postRow;
          if (id) selection.toggle(id);
        },
      },
    ],
    { enabled: !!data },
  );

  // ---- Render ----------------------------------------------------------
  if (sessionPending) return <PostsPageSkeleton />;
  if (!session) {
    return (
      <GuestPostsPageView
        pageTitle="Posts"
      />
    );
  }

  const counts = data?.statusCounts;
  const filtersActive = !!(list.platform || list.account || list.time || list.query || list.source);

  const allDrafts = selectedItems.length > 0 && selectedItems.every((i) => i.uiStatus === "draft");
  const allAgentDrafts = allDrafts && selectedItems.every((i) => i.isAgentDraft);
  const allScheduled = selectedItems.length > 0 && selectedItems.every((i) => i.uiStatus === "scheduled");
  const anyBusy = selectedItems.some((i) => busyIds.has(i.id));

  const paginationParams = Object.fromEntries(
    [...searchParams.entries()].filter(([k]) => k !== "page" && k !== "tiktok_published"),
  );

  return (
    <PageContainer className="pb-24 lg:pb-8">
      <PageHeader
        title="Posts"
        actions={
          <>
            <div className="hidden sm:block">
              <PostsSearchBox />
            </div>
            {!readOnly ? (
              <Link
                href={dash("bulk-tools")}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-bg-elevated px-3.5 text-sm font-medium text-text shadow-sm transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
              >
                <Upload className="size-4" aria-hidden />
                Import
              </Link>
            ) : null}
            {!readOnly ? (
              <button
                type="button"
                onClick={() => openComposer()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
              >
                <PenSquare className="size-4" aria-hidden />
                New post
              </button>
            ) : null}
          </>
        }
      >
        <div className="mb-3 sm:hidden">
          <PostsSearchBox />
        </div>
        <UrlTabs
          aria-label="Post status"
          defaultValue="all"
          items={POSTS_TABS.map((t) => ({
            value: t,
            label: POSTS_TAB_LABELS[t],
            count: tabCount(t, counts),
            tone: t === "failed" ? ("danger" as const) : ("default" as const),
          }))}
        />
      </PageHeader>

      <div className="space-y-4">
        {data?.showPaymentFailedBanner ? (
          <Banner
            tier="blocking"
            title="Some posts failed because your plan is inactive."
            actions={
              <Link href={dash("billing")} className={rowButtonClass}>
                Fix billing
              </Link>
            }
          >
            Update your plan, then retry them from the Failed tab.
          </Banner>
        ) : null}
        {tiktokPublished ? (
          <Banner
            tier="info"
            title="Published."
            onDismiss={() =>
              setSearchParams(
                (prev) => {
                  const p = new URLSearchParams(prev);
                  p.delete("tiktok_published");
                  return p;
                },
                { replace: true },
              )
            }
          >
            TikTok can take a few minutes to process the video before it shows on your profile.
          </Banner>
        ) : null}

        <PostsFilters
          platformOptions={data?.platformOptions ?? []}
          accountOptions={data?.accountOptions ?? []}
          sourceOptions={sourceOptions}
          view={view}
          onViewChange={setView}
        />

        {query.isLoading && !data ? (
          <SkeletonRows rows={8} />
        ) : !data ? (
          <ErrorState
            message="Couldn't load your posts."
            detail={
              query.data && !query.data.ok
                ? query.data.error
                : query.error instanceof Error
                  ? query.error.message
                  : null
            }
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : items.length === 0 && page > 1 && data.totalCount > 0 ? (
          <EmptyState
            compact
            title="Nothing on this page."
            description="These posts moved or were deleted."
            primaryAction={{
              label: "Go to the first page",
              onClick: () =>
                setSearchParams(
                  (prev) => {
                    const p = new URLSearchParams(prev);
                    p.delete("page");
                    return p;
                  },
                  { replace: true },
                ),
            }}
          />
        ) : items.length === 0 ? (
          filtersActive ? (
            <EmptyState
              compact
              title="No posts match these filters."
              primaryAction={{
                label: "Clear filters",
                onClick: () =>
                  setSearchParams(
                    (prev) => {
                      const p = new URLSearchParams(prev);
                      for (const k of ["platform", "account", "source", "time", "q", "page"]) p.delete(k);
                      return p;
                    },
                    { replace: true },
                  ),
              }}
            />
          ) : (
            // One line + text actions: the header already holds the filled "New post".
            <EmptyState
              compact
              title={`${EMPTY_COPY[tab].title}.`}
              description={EMPTY_COPY[tab].description}
              primaryAction={
                readOnly || tab === "failed" || tab === "published"
                  ? undefined
                  : tab === "scheduled"
                    ? { label: "Schedule a post", onClick: () => openComposer({ intent: "schedule" }) }
                    : { label: "Write a post", onClick: () => openComposer() }
              }
              secondaryAction={
                readOnly
                  ? undefined
                  : tab === "all" || tab === "review"
                    ? { label: "Let my agent post", href: dash("agents") }
                    : undefined
              }
            />
          )
        ) : (
          <div className={cn("transition-opacity", query.isFetching && query.isPlaceholderData && "opacity-60")}>
            {view === "cards" ? (
              <PostsCards
                items={items}
                selection={selection}
                readOnly={readOnly}
                timeOpts={timeOpts}
                navState={navState}
                detailHref={detailHref}
                onOpen={onOpen}
                healthById={healthById}
                canManageConnections={health.canManageConnections}
                handlers={handlers}
                busyIds={busyIds}
              />
            ) : (
              <PostsTable
                items={items}
                selection={selection}
                readOnly={readOnly}
                timeOpts={timeOpts}
                navState={navState}
                detailHref={detailHref}
                onOpen={onOpen}
                healthById={healthById}
                canManageConnections={health.canManageConnections}
                handlers={handlers}
                busyIds={busyIds}
              />
            )}
          </div>
        )}

        {data ? (
          <Pagination
            currentPage={page}
            totalPages={Math.max(1, Math.ceil((data.totalCount ?? 0) / POSTS_PAGE_SIZE))}
            basePath={dash("posts")}
            searchParams={paginationParams}
          />
        ) : null}
      </div>

      {!readOnly ? (
        <FloatingBulkBar count={selection.count} onClear={selection.clear} noun="post">
          {allDrafts ? (
            <BulkBarButton
              tone="primary"
              disabled={anyBusy}
              icon={<CheckCheck className="size-3.5" aria-hidden />}
              onClick={() => setScheduleTargets(selectedItems)}
            >
              {allAgentDrafts ? "Approve & schedule" : "Schedule"}
            </BulkBarButton>
          ) : null}
          {allScheduled ? (
            <>
              <BulkBarButton
                disabled={anyBusy}
                icon={<CalendarClock className="size-3.5" aria-hidden />}
                onClick={() => setRescheduleTargets(selectedItems)}
              >
                Reschedule
              </BulkBarButton>
              <BulkBarButton
                disabled={anyBusy}
                icon={<FileInput className="size-3.5" aria-hidden />}
                onClick={() => handlers.onMoveToDrafts(selectedItems)}
              >
                Move to drafts
              </BulkBarButton>
            </>
          ) : null}
          <BulkBarButton
            disabled={anyBusy}
            icon={<Copy className="size-3.5" aria-hidden />}
            onClick={() => handlers.onDuplicate(selectedItems)}
          >
            Duplicate
          </BulkBarButton>
          <BulkBarButton
            tone="danger"
            disabled={anyBusy}
            icon={<Trash2 className="size-3.5" aria-hidden />}
            onClick={() => setDeleteTargets(selectedItems)}
          >
            Delete
          </BulkBarButton>
        </FloatingBulkBar>
      ) : null}

      {draftPublishGate.limitModal}
      <DeletePostsDialog
        open={deleteTargets != null}
        onOpenChange={(o) => !o && setDeleteTargets(null)}
        statuses={(deleteTargets ?? []).map((t) => t.uiStatus)}
        onConfirm={confirmDelete}
      />
      <ScheduleDialog
        open={scheduleTargets != null}
        onOpenChange={(o) => !o && setScheduleTargets(null)}
        title={
          (scheduleTargets ?? []).every((t) => t.isAgentDraft)
            ? `Approve & schedule ${plural(scheduleTargets?.length ?? 0)}`
            : `Schedule ${plural(scheduleTargets?.length ?? 0)}`
        }
        description="Caption, accounts and media stay as they are. Open a post to change them first."
        confirmLabel="Schedule"
        count={scheduleTargets?.length ?? 0}
        timezone={data?.timezone ?? null}
        onConfirm={confirmSchedule}
      />
      <ScheduleDialog
        open={rescheduleTargets != null}
        onOpenChange={(o) => !o && setRescheduleTargets(null)}
        title={`Reschedule ${plural(rescheduleTargets?.length ?? 0)}`}
        confirmLabel="Reschedule"
        defaultMode="time"
        count={rescheduleTargets?.length ?? 0}
        timezone={data?.timezone ?? null}
        initialAt={rescheduleTargets?.length === 1 ? rescheduleTargets[0]!.scheduledAt : null}
        onConfirm={confirmReschedule}
      />
    </PageContainer>
  );
}
