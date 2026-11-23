import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import {
  CalendarClock,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileInput,
  MoreHorizontal,
  Pencil,
  Repeat,
  RotateCw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import {
  Banner,
  ErrorState,
  PageContainer,
  PageHeader,
  Skeleton,
  SkeletonCard,
  StatusPill,
  networkLabel,
  useAccountHealth,
  useDashboardPath,
  type AccountWithHealth,
} from "@/components/app";
import {
  loadPostDetailCoreData,
  loadPostDetailMediaData,
} from "@/api/dashboard-data";
import { PostAnalyticsPanel } from "@/features/dashboard/analytics/PostAnalyticsPanel";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";
import { capturePostAction } from "@/lib/posthog-events";
import { sortBySlowPlatformsLast } from "@/lib/publish-order";
import { cn } from "@/lib/utils";
import { ActionMenu, type MenuItem } from "./ActionMenu";
import { ActivityTimeline } from "./ActivityTimeline";
import { DeletePostsDialog } from "./DeletePostsDialog";
import { DeliveriesCard } from "./DeliveriesCard";
import { PostAdjacentNav } from "./PostAdjacentNav";
import { useAdjacentPosts } from "./use-adjacent-posts";
import { useDraftPublishGate } from "./use-draft-publish-gate";
import { usePostAgain } from "./use-post-again";
import { PostDetailAutoFeaturesSection } from "./PostDetailAutoFeaturesSection";
import { PostPreviewCard } from "./PostPreviewCard";
import { PostProperties } from "./PostProperties";
import { editHref, rowButtonClass } from "./post-links";
import { ScheduleDialog } from "./ScheduleDialog";
import {
  deletePosts,
  duplicatePosts,
  moveToDrafts,
  publishNow,
  publishToast,
  reschedulePosts,
  restoreSchedule,
  retryPublications,
  scheduleDrafts,
  summarize,
  type PostRef,
  type ScheduleTarget,
} from "./post-actions";
import { resolveBack, tabLabel, type PostNavState } from "./post-nav";
import {
  displayError,
  earliestPublishedAt,
  effectiveStatus,
  firstLine,
  getDisplayType,
  getThreadParts,
  hydratePublication,
  pillFor,
  sourceFromDto,
  STUCK_PUBLISHING_MINUTES,
  tabForStatus,
  untitledLabel,
  type TimeOpts,
} from "./posts-model";
import {
  clearRetryAfterReconnect,
  peekRetriesAfterReconnect,
  rememberRetryAfterReconnect,
  withReturnTo,
} from "./reconnect-retry";

const secondaryBtn = cn(rowButtonClass, "h-9 px-3.5 text-sm touch:h-11");
const primaryBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 touch:h-11";
const iconBtn =
  "inline-flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 aria-disabled:pointer-events-none aria-disabled:opacity-40 touch:size-10";

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading post" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-8 w-2/3" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </div>
        <div className="space-y-4">
          <Skeleton className="aspect-[4/5] max-h-80 w-full rounded-xl" />
          <SkeletonCard lines={5} />
        </div>
      </div>
    </div>
  );
}

/**
 * Post detail (mock 06·A): deliveries first (per account status, plain
 * error + matching fix, Retry failed), performance (collapsed), activity
 * timeline; preview + properties + automations on the right.
 */
export function PostDetailView({ postId }: { postId: string }) {
  const dash = useDashboardPath();
  const navigate = useNavigate();
  const location = useLocation();
  const posthog = usePostHog();
  const invalidate = useInvalidateQueries();
  const { ready: permsReady, canCreatePosts, canViewAnalytics } = useWorkspaceNavPermissions();
  const readOnly = permsReady && !canCreatePosts;
  const health = useAccountHealth();
  const adjacent = useAdjacentPosts(postId);
  const postAgain = usePostAgain("post_detail");
  const draftPublishGate = useDraftPublishGate();
  const navState = (location.state as PostNavState | null) ?? null;

  const coreQ = useQuery({
    queryKey: ["post-detail", postId],
    queryFn: () => loadPostDetailCoreData(postId),
    enabled: !!postId,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d?.ok) return false;
      const live =
        d.data.post.status === "publishing" ||
        d.data.publications.some((p) => p.status === "publishing" || p.status === "processing");
      return live ? 3000 : false;
    },
  });
  const mediaQ = useQuery({
    queryKey: ["post-detail-media", postId],
    queryFn: () => loadPostDetailMediaData(postId),
    enabled: !!postId,
  });

  const [retryingIds, setRetryingIds] = useState<Set<string>>(() => new Set());
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const core = coreQ.data?.ok ? coreQ.data.data : null;
  const coreError = coreQ.data && !coreQ.data.ok ? coreQ.data.error : null;
  const media = useMemo(() => (mediaQ.data?.ok ? mediaQ.data.data.media : []), [mediaQ.data]);
  const mediaError = (mediaQ.data && !mediaQ.data.ok && mediaQ.data.error !== "Unauthorized") || mediaQ.isError;

  // Signed out / deleted.
  useEffect(() => {
    if (coreError === "Unauthorized" || (mediaQ.data && !mediaQ.data.ok && mediaQ.data.error === "Unauthorized")) {
      navigate("/");
    } else if (coreError === "NotFound") {
      toast.message("That post no longer exists.");
      navigate(dash("posts"), { replace: true });
    }
  }, [coreError, mediaQ.data, navigate, dash]);

  const healthById = useMemo(() => {
    const m = new Map<string, AccountWithHealth>();
    for (const a of health.accounts) m.set(a.id, a);
    return m;
  }, [health.accounts]);

  const model = useMemo(() => {
    if (!core) return null;
    const post = core.post;
    const metadata = post.metadata ?? null;
    const createdAt = post.createdAt ? new Date(post.createdAt) : null;
    const queuedAt = core.queuedSlot ? new Date(core.queuedSlot.scheduledFor) : null;
    const scheduledAt = queuedAt ?? (post.scheduledAt ? new Date(post.scheduledAt) : null);
    const publications = sortBySlowPlatformsLast(core.publications.map(hydratePublication));
    const parts = getThreadParts(post.originalContent, metadata);
    const displayType = getDisplayType({
      metadata,
      partCount: parts.length,
      mediaCount: media.length || (post.mediaIds?.length ?? 0),
      firstMime: media[0]?.mimeType ?? "",
      hasVideo: media.some((m) => m.mimeType.startsWith("video/")),
    });
    const source = sourceFromDto(post.source, metadata);
    const status = post.status ?? "draft";
    const uiStatus = effectiveStatus(status, {
      createdAt,
      scheduledAt,
      updatedAt: post.updatedAt ? new Date(post.updatedAt) : null,
    });
    const isAgentDraft = uiStatus === "draft" && source.isAgent;
    const title = firstLine(parts[0]?.text ?? post.originalContent, 140);
    const accountIds = [
      ...new Set(publications.map((p) => p.connectedAccountId).filter((id): id is string => !!id)),
    ];
    const ref: PostRef = {
      id: post.id,
      status,
      originalContent: post.originalContent,
      accountIds,
      mediaIds: post.mediaIds ?? [],
      metadata,
      scheduledAt,
      queueSlotId: core.queuedSlot?.slotId ?? null,
    };
    return {
      post,
      metadata,
      createdAt,
      scheduledAt,
      isQueued: !!core.queuedSlot,
      publications,
      parts,
      displayType,
      source,
      status,
      uiStatus,
      isAgentDraft,
      pill: pillFor(uiStatus, isAgentDraft),
      title: title || untitledLabel(displayType),
      hasCaption: !!title,
      publishedAt: earliestPublishedAt(publications),
      ref,
    };
  }, [core, media]);

  const timeOpts: TimeOpts = {
    timezone: core?.timezone ?? null,
    use24HourTimeFormat: core?.use24HourTimeFormat ?? false,
    dateFormat: core?.dateFormat ?? null,
  };

  // Your own drafts open in the editor (as before). Only on first load, so
  // "Move to drafts" here doesn't throw you into the composer.
  const [firstStatus, setFirstStatus] = useState<{ status: string; agent: boolean } | null>(null);
  if (model && !firstStatus) {
    setFirstStatus({ status: model.uiStatus, agent: model.isAgentDraft });
  }
  const redirectToEditor =
    !!model &&
    permsReady &&
    !readOnly &&
    !mediaQ.isLoading &&
    firstStatus?.status === "draft" &&
    !firstStatus.agent &&
    model.uiStatus === "draft";
  useEffect(() => {
    if (redirectToEditor && model) {
      navigate(editHref(dash, { id: postId, uiStatus: "draft" }), {
        replace: true,
      });
    }
  }, [redirectToEditor, model, dash, navigate, postId]);

  // ---- Actions ---------------------------------------------------------
  const refresh = () => {
    invalidate();
    void coreQ.refetch();
  };

  // Skip deliveries whose retry is still in flight. A second request for the
  // same delivery is skipped server side as "already in progress" (a false
  // "Publishing failed" toast, one more publish off the hourly limit), and its
  // `finally` would clear the row while the first request still runs. Clicks
  // are discrete events, so React has re-rendered with the new `retryingIds`
  // before the next one lands.
  const runRetry = (ids: string[], source = "post_detail_retry") => {
    const fresh = [...new Set(ids)].filter((id) => !retryingIds.has(id));
    if (fresh.length === 0) return;
    setRetryingIds((prev) => new Set([...prev, ...fresh]));
    void retryPublications(postId, fresh)
      .then((r) => {
        const t = publishToast(r);
        toast[t.tone](t.message, { description: t.description });
        capturePostAction(posthog, "post_published", { source, platform_count: fresh.length });
      })
      .finally(() => {
        setRetryingIds((prev) => {
          const next = new Set(prev);
          for (const id of fresh) next.delete(id);
          return next;
        });
        refresh();
      });
  };

  const runPublishNow = () => {
    if (model && draftPublishGate.blocksPublish(model.uiStatus)) return;
    setPublishing(true);
    void publishNow(postId)
      .then((r) => {
        const t = publishToast(r);
        toast[t.tone](t.message, { description: t.description });
        capturePostAction(posthog, "post_published", {
          source: model?.uiStatus === "failed" ? "post_detail_retry" : "post_detail_publish_now",
          post_status: model?.uiStatus,
        });
      })
      .finally(() => {
        setPublishing(false);
        refresh();
      });
  };

  // Reconnect & retry: run the remembered retry once the server says the
  // account was re-authorized after the delivery failed. A healthy
  // token_status alone proves nothing (nothing on the publish path flips it),
  // so a cancelled consent screen would otherwise retry with the dead token.
  const autoRetriedRef = useRef(false);
  useEffect(() => {
    if (!model || autoRetriedRef.current || health.isLoading || !permsReady || readOnly) return;
    const pending = peekRetriesAfterReconnect(postId);
    if (pending.length === 0) return;
    const ids: string[] = [];
    const names: string[] = [];
    for (const entry of pending) {
      const account = healthById.get(entry.accountId);
      if (!account || account.health !== "healthy") continue;
      const failed = entry.publicationIds.flatMap((id) => {
        const pub = model.publications.find((p) => p.publicationId === id && p.status === "failed");
        return pub ? [pub] : [];
      });
      if (failed.length === 0) {
        // Nothing left to retry (already retried or delivered).
        clearRetryAfterReconnect(postId, entry.accountId);
        continue;
      }
      const ready = failed.filter((p) => p.reconnectedSinceFailure === true);
      if (ready.length === 0) continue; // not reconnected yet: keep the note
      // Clear the failed ones being retried now plus any that no longer
      // failed; still-unreconnected ones stay for a later real reconnect.
      const waiting = new Set(failed.filter((p) => !p.reconnectedSinceFailure).map((p) => p.publicationId));
      clearRetryAfterReconnect(
        postId,
        entry.accountId,
        entry.publicationIds.filter((id) => !waiting.has(id)),
      );
      for (const pub of ready) {
        ids.push(pub.publicationId);
        names.push(networkLabel(pub.platform));
      }
    }
    if (ids.length === 0) return;
    autoRetriedRef.current = true;
    toast.message(`Reconnected. Retrying ${[...new Set(names)].join(", ")}…`);
    // Deferred so the effect only schedules work (runRetry sets state).
    window.setTimeout(() => runRetry(ids, "post_detail_reconnect_retry"), 0);
    // One-shot (guarded by autoRetriedRef); runRetry is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, health.isLoading, healthById, postId, permsReady, readOnly]);

  const onReconnect = (pub: { publicationId: string; connectedAccountId: string | null }, href: string) => {
    if (pub.connectedAccountId) {
      rememberRetryAfterReconnect({
        postId,
        accountId: pub.connectedAccountId,
        publicationIds: [pub.publicationId],
      });
    }
    return withReturnTo(href, location.pathname);
  };

  const duplicate = () => {
    if (!model) return;
    setBusy(true);
    void duplicatePosts([model.ref])
      .then((res) => {
        const newId = res.createdIds[0];
        if (newId) {
          capturePostAction(posthog, "post_duplicated", { source: "post_detail", count: 1 });
          toast.success("Duplicated as a draft", {
            action: {
              label: "Open",
              onClick: () => navigate(editHref(dash, { id: newId, uiStatus: "draft" })),
            },
          });
        } else {
          toast.error("Couldn't duplicate this post", { description: res.failed[0]?.error });
        }
      })
      .finally(() => {
        setBusy(false);
        invalidate();
      });
  };

  const unschedule = () => {
    if (!model) return;
    setBusy(true);
    void moveToDrafts([model.ref])
      .then((res) => {
        const s = summarize(res, "Moved", " to drafts");
        if (s.tone === "success") toast.success("Moved to drafts");
        else toast.error("Couldn't move this post to drafts", { description: s.description });
      })
      .finally(() => {
        setBusy(false);
        refresh();
      });
  };

  const back = resolveBack(navState?.from, dash("posts"));

  // ---- Render ----------------------------------------------------------
  if (coreQ.isLoading || (model && redirectToEditor)) return <DetailSkeleton />;
  if (!model || !core) {
    if (coreError === "NotFound" || coreError === "Unauthorized") return <DetailSkeleton />;
    return (
      <ErrorState
        message="Couldn't load this post."
        detail={coreError ?? (coreQ.error instanceof Error ? coreQ.error.message : null)}
        onRetry={() => void coreQ.refetch()}
        retrying={coreQ.isFetching}
      />
    );
  }

  const {
    post,
    publications,
    uiStatus,
    isAgentDraft,
    pill,
    scheduledAt,
    isQueued,
    source,
  } = model;
  const tab = tabForStatus(uiStatus, isAgentDraft);
  const tabHref = dash(tab === "all" ? "posts" : `posts?tab=${tab}`);
  const delivered = publications.filter((p) => p.status === "published").length;
  const pillLabel =
    (uiStatus === "published" || uiStatus === "partial") && publications.length > 1
      ? `${delivered} of ${publications.length} live`
      : undefined;
  const failedPubs = publications.filter((p) => p.status === "failed");
  const edit = editHref(dash, { id: post.id, uiStatus });

  // Auto-Plug / Auto-Repost (X only), same rules as before.
  const xPublished = publications.filter((p) => p.platform === "twitter_x" && p.status === "published");
  const xPublishedAt = earliestPublishedAt(xPublished);
  const xPublishedAccountIds = xPublished.map((p) => p.connectedAccountId).filter((id): id is string => !!id);
  const xSelectedAccountIds = [
    ...new Set(
      publications
        .filter((p) => p.platform === "twitter_x")
        .map((p) => p.connectedAccountId)
        .filter((id): id is string => !!id),
    ),
  ];
  const bulk = (post.metadata?.bulkAutoFeatures ?? null) as {
    autoRepostConfig?: { intervalHours: number; maxResurfaces: number; plugComment?: string };
    autoPlugConfig?: { metricType: string; threshold: number; plugComment: string };
  } | null;
  const pendingAutoPlug = bulk?.autoPlugConfig
    ? {
        metricType: bulk.autoPlugConfig.metricType === "retweets" ? ("retweets" as const) : ("likes" as const),
        threshold: bulk.autoPlugConfig.threshold,
        plugComment: bulk.autoPlugConfig.plugComment,
      }
    : null;
  const pendingResurface = bulk?.autoRepostConfig
    ? {
        intervalHours: bulk.autoRepostConfig.intervalHours,
        maxResurfaces: bulk.autoRepostConfig.maxResurfaces,
        plugComment: bulk.autoRepostConfig.plugComment ?? "",
      }
    : null;
  const isPublishedish = uiStatus === "published" || uiStatus === "partial";
  const showAuto =
    !readOnly &&
    ((xPublished.length > 0 && isPublishedish) || (uiStatus === "scheduled" && xSelectedAccountIds.length > 0));
  const showAnalytics = canViewAnalytics && isPublishedish;

  const automations: string[] = [];
  if (core.autoPlug) {
    automations.push(
      `Auto-Plug at ${core.autoPlug.metricThreshold} ${core.autoPlug.metricType === "retweets" ? "reposts" : "likes"}${
        core.autoPlug.status === "watching" ? "" : ` (${core.autoPlug.status})`
      }`,
    );
  } else if (pendingAutoPlug) {
    automations.push(`Auto-Plug at ${pendingAutoPlug.threshold} ${pendingAutoPlug.metricType === "retweets" ? "reposts" : "likes"}`);
  }
  if (core.resurface) {
    automations.push(
      `Auto-Repost every ${core.resurface.intervalHours}h · ${core.resurface.resurfacesDone} of ${core.resurface.maxResurfaces} done${
        core.resurface.isActive ? "" : " (paused)"
      }`,
    );
  } else if (pendingResurface) {
    automations.push(`Auto-Repost every ${pendingResurface.intervalHours}h, ${pendingResurface.maxResurfaces}×`);
  }

  // ⋯ menu
  const menu: MenuItem[] = [];
  if (!readOnly) {
    if (uiStatus === "draft") {
      menu.push({ label: "Publish now", onSelect: runPublishNow, icon: <Send />, disabled: publishing });
    } else if (uiStatus === "scheduled") {
      menu.push(
        { label: "Reschedule…", onSelect: () => setRescheduleOpen(true), icon: <CalendarClock /> },
        { label: "Publish now", onSelect: runPublishNow, icon: <Send />, disabled: publishing },
        { label: "Move to drafts", onSelect: unschedule, icon: <FileInput />, disabled: busy },
      );
    } else if (isPublishedish) {
      menu.push({ label: "Post again", onSelect: () => void postAgain.run(post.id, { title: model.title }), icon: <Repeat /> });
    }
    if (failedPubs.length > 0) {
      // Same rows DeliveriesCard's "Retry failed" offers: not the ones whose
      // retry is still running.
      const retryable = failedPubs.filter((p) => !retryingIds.has(p.publicationId));
      menu.push({
        label: retryable.length > 0 ? `Retry failed (${retryable.length})` : "Retrying…",
        onSelect: () => runRetry(retryable.map((p) => p.publicationId)),
        icon: <RotateCw />,
        disabled: retryable.length === 0,
      });
    } else if (uiStatus === "failed") {
      menu.push({
        label: "Retry",
        onSelect: runPublishNow,
        icon: <RotateCw />,
        disabled: publishing || retryingIds.size > 0,
      });
    }
    if (uiStatus === "draft" || uiStatus === "scheduled") {
      menu.push({ label: "Duplicate", onSelect: duplicate, icon: <Copy />, disabled: busy });
    }
    if (menu.length > 0) menu.push({ kind: "separator" });
    menu.push({ label: "Delete…", tone: "danger", onSelect: () => setDeleteOpen(true), icon: <Trash2 /> });
  }

  const postFailure =
    uiStatus === "failed" && failedPubs.length === 0
      ? (post.failureReason?.trim() ||
        (post.status === "publishing"
          ? `Publishing has been stuck for over ${STUCK_PUBLISHING_MINUTES} minutes.`
          : "Publishing failed."))
      : null;

  return (
    <PageContainer className="pb-10">
      <PostAdjacentNav
        prevHref={adjacent.prevHref}
        nextHref={adjacent.nextHref}
        state={adjacent.state}
      />
      <PageHeader
        breadcrumb={
          <div className="flex items-center justify-between gap-3">
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
              <Link href={back.href} className="truncate hover:text-text hover:underline underline-offset-2">
                {back.label}
              </Link>
              {back.fromPosts && tab !== "all" ? (
                <>
                  <span aria-hidden className="text-text-subtle">›</span>
                  <Link href={tabHref} className="truncate hover:text-text hover:underline underline-offset-2">
                    {tabLabel(tab)}
                  </Link>
                </>
              ) : null}
            </nav>
            <div className="flex shrink-0 items-center gap-0.5">
              {adjacent.prevHref ? (
                <Link href={adjacent.prevHref} state={adjacent.state} className={iconBtn} aria-label="Previous post (K)">
                  <ChevronLeft className="size-4" aria-hidden />
                </Link>
              ) : (
                <span className={iconBtn} aria-disabled="true" aria-label="No previous post">
                  <ChevronLeft className="size-4" aria-hidden />
                </span>
              )}
              {adjacent.nextHref ? (
                <Link href={adjacent.nextHref} state={adjacent.state} className={iconBtn} aria-label="Next post (J)">
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <span className={iconBtn} aria-disabled="true" aria-label="No next post">
                  <ChevronRight className="size-4" aria-hidden />
                </span>
              )}
            </div>
          </div>
        }
        title={
          <span className={cn("line-clamp-2 break-words", !model.hasCaption && "italic text-text-muted")}>
            {model.title}
          </span>
        }
        actions={
          <>
            <StatusPill status={pill} label={pillLabel} size="md" />
            {!readOnly ? (
              <>
                {uiStatus !== "draft" && uiStatus !== "scheduled" ? (
                  <button type="button" className={secondaryBtn} onClick={duplicate} disabled={busy}>
                    <Copy className="size-4" aria-hidden />
                    Duplicate
                  </button>
                ) : null}
                {uiStatus !== "publishing" ? (
                  <Link href={edit} className={secondaryBtn}>
                    <Pencil className="size-4" aria-hidden />
                    {isPublishedish ? "Edit and post" : "Edit"}
                  </Link>
                ) : null}
                {uiStatus === "draft" ? (
                  <button type="button" className={primaryBtn} onClick={() => setScheduleOpen(true)}>
                    <CheckCheck className="size-4" aria-hidden />
                    {isAgentDraft ? "Approve & schedule" : "Schedule"}
                  </button>
                ) : null}
                <ActionMenu
                  aria-label="More post actions"
                  items={menu}
                  trigger={(props) => (
                    <button type="button" {...props} aria-label="More actions" className={cn(secondaryBtn, "w-9 px-0 touch:w-11")}>
                      <MoreHorizontal className="size-4" aria-hidden />
                    </button>
                  )}
                />
              </>
            ) : null}
          </>
        }
      />

      <div className="mb-4 space-y-3 empty:hidden">
        {core.showPaymentFailedBanner ? (
          <Banner
            tier="blocking"
            title="Some posts failed because your plan is inactive."
            actions={
              <Link href={dash("billing")} className={rowButtonClass}>
                Fix billing
              </Link>
            }
          >
            Update your plan, then retry.
          </Banner>
        ) : null}
        {isAgentDraft ? (
          <Banner tier="info" title={`${source.label} drafted this post.`}>
            Check the caption and accounts, then approve it to schedule. Nothing goes out until you do.
          </Banner>
        ) : null}
        {postFailure ? (
          <Banner
            tier="danger"
            title="This post didn't go out."
            actions={
              readOnly ? undefined : post.failureKind === "plan" ? (
                <Link href={dash("billing")} className={rowButtonClass}>
                  Upgrade
                </Link>
              ) : (
                <button
                  type="button"
                  className={rowButtonClass}
                  onClick={runPublishNow}
                  disabled={publishing || retryingIds.size > 0}
                >
                  <RotateCw className="size-3.5" aria-hidden />
                  {publishing ? "Retrying…" : "Retry"}
                </button>
              )
            }
          >
            {displayError(publications[0]?.platform ?? "", postFailure) ?? postFailure}
          </Banner>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <DeliveriesCard
            postStatus={publishing ? "publishing" : uiStatus}
            isQueued={isQueued}
            scheduledAt={scheduledAt}
            publications={publications}
            retryingIds={retryingIds}
            healthById={healthById}
            canManageConnections={health.canManageConnections}
            readOnly={readOnly}
            timeOpts={timeOpts}
            editHref={edit}
            billingHref={dash("billing")}
            onRetry={(ids) => runRetry(ids)}
            onReconnect={onReconnect}
          />
          {showAnalytics ? (
            <PostAnalyticsPanel postId={post.id} enabled={delivered > 0} />
          ) : null}
          <ActivityTimeline
            source={source}
            isAgentDraft={isAgentDraft}
            createdAt={model.createdAt}
            status={uiStatus}
            scheduledAt={scheduledAt}
            isQueued={isQueued}
            publications={publications}
            events={core.publishTimeline ?? []}
            timeOpts={timeOpts}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <PostPreviewCard
            parts={model.parts}
            mainCaption={post.originalContent ?? ""}
            metadata={model.metadata}
            media={media}
            mediaLoading={mediaQ.isLoading}
            mediaError={!!mediaError}
            onRetryMedia={() => void mediaQ.refetch()}
            publications={publications}
          />
          <PostProperties
            postId={post.id}
            scheduledAt={uiStatus === "scheduled" || uiStatus === "draft" ? scheduledAt : null}
            isQueued={isQueued}
            publishedAt={model.publishedAt}
            createdAt={model.createdAt}
            source={source}
            displayType={model.displayType}
            automations={automations}
            timeOpts={timeOpts}
          />
          {showAuto ? (
            <PostDetailAutoFeaturesSection
              postId={post.id}
              publishedAt={uiStatus === "scheduled" ? null : xPublishedAt}
              variant={uiStatus === "scheduled" ? "scheduled" : "published"}
              pendingAutoPlugFromServer={uiStatus === "scheduled" ? pendingAutoPlug : null}
              pendingResurfaceFromServer={uiStatus === "scheduled" ? pendingResurface : null}
              use24HourTimeFormat={core.use24HourTimeFormat}
              allowAutoPlug={core.allowAutoPlug}
              allowResurface={core.allowResurface}
              autoPlugDetail={core.autoPlug}
              resurfaceDetail={core.resurface}
              selectedAccountIds={uiStatus === "scheduled" ? xSelectedAccountIds : xPublishedAccountIds}
              onUpdated={() => void coreQ.refetch()}
            />
          ) : null}
        </div>
      </div>

      {draftPublishGate.limitModal}
      <DeletePostsDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        statuses={[uiStatus]}
        onConfirm={async () => {
          const res = await deletePosts([post.id]);
          if (res.ok.length === 1) {
            capturePostAction(posthog, uiStatus === "scheduled" ? "post_cancelled" : "post_deleted", {
              source: "post_detail",
              post_status: uiStatus,
            });
            toast.success("Post deleted");
            invalidate();
            navigate(back.href, { replace: true });
          } else {
            toast.error("Couldn't delete this post", { description: res.failed[0]?.error });
          }
        }}
      />
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        title={isAgentDraft ? "Approve & schedule" : "Schedule this post"}
        description="Caption, accounts and media stay as they are. Use Edit to change them first."
        confirmLabel="Schedule"
        count={1}
        timezone={core.timezone}
        initialAt={scheduledAt}
        onConfirm={async (target: ScheduleTarget) => {
          const res = await scheduleDrafts([model.ref], target);
          if (res.ok.length === 1) {
            toast.success(isAgentDraft ? "Approved and scheduled" : "Scheduled");
            capturePostAction(posthog, isAgentDraft ? "agent_draft_approved" : "post_scheduled", {
              source: "post_detail",
              via: target.kind,
            });
          } else {
            toast.error("Couldn't schedule this post", { description: res.failed[0]?.error });
          }
          refresh();
        }}
      />
      <ScheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        title="Reschedule"
        confirmLabel="Reschedule"
        defaultMode="time"
        count={1}
        timezone={core.timezone}
        initialAt={scheduledAt}
        onConfirm={async (target: ScheduleTarget) => {
          const res = await reschedulePosts([model.ref], target);
          if (res.ok.length === 1) {
            const previous = res.previous;
            toast.success("Rescheduled", {
              action:
                previous.length > 0
                  ? {
                      label: "Undo",
                      onClick: () => {
                        void restoreSchedule(previous).then((undo) => {
                          if (undo.failed.length) toast.error("Couldn't move it back.", { description: undo.failed[0]?.error });
                          else toast.message("Moved back");
                          refresh();
                        });
                      },
                    }
                  : undefined,
            });
          } else {
            toast.error("Couldn't reschedule this post", { description: res.failed[0]?.error });
          }
          refresh();
        }}
      />
    </PageContainer>
  );
}
