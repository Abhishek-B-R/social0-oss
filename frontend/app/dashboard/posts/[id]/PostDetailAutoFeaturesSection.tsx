"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { useAccountsForForm } from "@/app/dashboard/create/useAccountsForForm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createAutoPlug,
  createResurfaceSchedule,
  updateAutoPlug,
  updateResurfaceSchedule,
  disableResurfaceSchedule,
  cancelAutoPlug,
} from "@/app/actions/resurface";
import { updateScheduledPostAutoFeatures } from "@/app/actions/posts";
import {
  isWithinAutoPlugWindow,
  isWithinResurfaceWindow,
  isPostOlderThanAutoFeaturesEditWindow,
  getResurfacePlatformForApi,
  getResurfacePlatforms,
} from "@/lib/resurface-utils";
import type { AutoPlugDetail, ResurfaceDetail } from "../posts-list-data";
import {
  AutoPlugPanel,
  type AutoPlugConfig,
} from "@/components/autoplug/AutoPlugPanel";
import {
  AutoResurfacePanel,
  type AutoResurfaceConfig,
} from "@/components/repost/AutoResurfacePanel";

/** Loading state that mirrors the two-row layout (not the account grid). */
function PostDetailAutoFeaturesSkeleton() {
  return (
    <div className="rounded-2xl border border-border/80 bg-bg-elevated p-5 shadow-sm dark:border-white/8 dark:bg-[#121212]/95 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="space-y-1.5 mb-4">
        <div
          className="h-5 w-56 max-w-[85%] rounded-md bg-muted animate-pulse"
          aria-hidden
        />
        <div
          className="h-3.5 w-full max-w-lg rounded bg-muted/70 animate-pulse"
          aria-hidden
        />
      </div>
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg-muted/40 dark:bg-[#1a1a1a]/90 dark:border-white/6 px-3.5 py-3 min-h-13"
          >
            <div className="space-y-2 min-w-0 flex-1">
              <div
                className="h-4 w-28 rounded bg-muted animate-pulse"
                aria-hidden
              />
              <div
                className="h-3 w-24 rounded bg-muted/60 animate-pulse"
                aria-hidden
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div
                className="h-8 w-8 rounded-lg bg-muted/70 animate-pulse"
                aria-hidden
              />
              <div
                className="h-5 w-9 rounded-full bg-muted animate-pulse"
                aria-hidden
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TOGGLE_ON =
  "bg-[#34a853] hover:bg-[#2d9047] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]";
const TOGGLE_OFF = "bg-neutral-300 dark:bg-neutral-600";

function toFullAutoPlug(
  p: Partial<AutoPlugConfig> | null | undefined,
): AutoPlugConfig | null {
  if (!p?.plugComment?.trim() || p.threshold == null || !p.metricType) {
    return null;
  }
  return {
    metricType: p.metricType === "retweets" ? "retweets" : "likes",
    threshold: p.threshold,
    plugComment: p.plugComment.trim(),
  };
}

function toFullResurface(
  p: Partial<AutoResurfaceConfig> | null | undefined,
): AutoResurfaceConfig | null {
  if (p == null || p.intervalHours == null || p.maxResurfaces == null) {
    return null;
  }
  return {
    intervalHours: p.intervalHours,
    maxResurfaces: p.maxResurfaces,
    plugComment: p.plugComment?.trim() ?? "",
  };
}

function FeatureRowShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg-muted/40 dark:bg-[#1a1a1a]/90 dark:border-white/6 px-3.5 py-3 min-h-13 min-w-0 transition-colors",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PostDetailAutoFeaturesSection({
  postId,
  publishedAt,
  use24HourTimeFormat,
  allowAutoPlug,
  allowResurface,
  autoPlugDetail,
  resurfaceDetail,
  selectedAccountIds,
  variant = "published",
  pendingAutoPlugFromServer = null,
  pendingResurfaceFromServer = null,
}: {
  postId: string;
  publishedAt: Date | null;
  use24HourTimeFormat: boolean;
  allowAutoPlug: boolean;
  allowResurface: boolean;
  autoPlugDetail: AutoPlugDetail | null;
  resurfaceDetail: ResurfaceDetail | null;
  selectedAccountIds: string[];
  variant?: "published" | "scheduled";
  pendingAutoPlugFromServer?: Partial<AutoPlugConfig> | null;
  pendingResurfaceFromServer?: Partial<AutoResurfaceConfig> | null;
}) {
  const router = useRouter();
  const { accounts, loading } = useAccountsForForm(null);
  const [plugModalOpen, setPlugModalOpen] = useState(false);
  const [resurfaceModalOpen, setResurfaceModalOpen] = useState(false);
  const [savingPlug, setSavingPlug] = useState(false);
  const [savingResurface, setSavingResurface] = useState(false);
  const [togglingPlug, setTogglingPlug] = useState(false);
  const [togglingResurface, setTogglingResurface] = useState(false);
  const [draftPlug, setDraftPlug] = useState<AutoPlugConfig | null>(null);
  const [draftResurface, setDraftResurface] =
    useState<AutoResurfaceConfig | null>(null);

  const isScheduled = variant === "scheduled";

  const pub =
    publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null;
  const withinAuto = pub ? isWithinAutoPlugWindow(pub) : false;
  const withinResurface = pub ? isWithinResurfaceWindow(pub) : false;

  const hasX = getResurfacePlatforms(selectedAccountIds, accounts).length > 0;

  const autoPlugRowVisible =
    hasX && (isScheduled || !!autoPlugDetail || withinAuto);
  const resurfaceRowVisible =
    hasX && (isScheduled || !!resurfaceDetail || withinResurface);

  /** Plug already fired or finished - no edits. */
  const plugLocked =
    !isScheduled && !!autoPlugDetail && autoPlugDetail.status !== "watching";
  /** At least one reshare executed - no edits. */
  const repostLocked =
    !isScheduled && !!resurfaceDetail && resurfaceDetail.resurfacesDone > 0;

  /** Published more than 24h ago - no Auto-Plug / Auto-Repost edits (UI + API). */
  const ageLocked =
    !isScheduled && pub != null && isPostOlderThanAutoFeaturesEditWindow(pub);

  const plugEditLocked = plugLocked || ageLocked;
  const repostEditLocked = repostLocked || ageLocked;

  const plugInitial: Partial<AutoPlugConfig> | null = isScheduled
    ? pendingAutoPlugFromServer?.plugComment?.trim()
      ? {
          metricType:
            pendingAutoPlugFromServer.metricType === "retweets"
              ? "retweets"
              : "likes",
          threshold: pendingAutoPlugFromServer.threshold ?? 0,
          plugComment: pendingAutoPlugFromServer.plugComment ?? "",
        }
      : null
    : autoPlugDetail && autoPlugDetail.status === "watching"
      ? {
          metricType:
            autoPlugDetail.metricType === "retweets" ? "retweets" : "likes",
          threshold: autoPlugDetail.metricThreshold,
          plugComment: autoPlugDetail.plugComment,
        }
      : null;

  const resurfaceInitial: Partial<AutoResurfaceConfig> | null = isScheduled
    ? pendingResurfaceFromServer &&
      pendingResurfaceFromServer.intervalHours != null &&
      pendingResurfaceFromServer.maxResurfaces != null
      ? {
          intervalHours: pendingResurfaceFromServer.intervalHours,
          maxResurfaces: pendingResurfaceFromServer.maxResurfaces,
          plugComment: pendingResurfaceFromServer.plugComment ?? "",
        }
      : null
    : resurfaceDetail
      ? {
          intervalHours: resurfaceDetail.intervalHours,
          maxResurfaces: resurfaceDetail.maxResurfaces,
          plugComment: resurfaceDetail.plugComment ?? "",
        }
      : null;

  const plugToggleOn = isScheduled
    ? !!toFullAutoPlug(pendingAutoPlugFromServer)
    : !!autoPlugDetail && autoPlugDetail.status === "watching";

  /** Schedule still running (pending reshares) - ON when active; OFF when paused or finished. */
  const resurfaceToggleOn = isScheduled
    ? !!toFullResurface(pendingResurfaceFromServer)
    : !!resurfaceDetail &&
      resurfaceDetail.isActive &&
      resurfaceDetail.resurfacesDone < resurfaceDetail.maxResurfaces;

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleSavePlugModal = useCallback(async () => {
    if (!draftPlug) {
      toast.error("Fill in Auto-Plug settings.");
      return;
    }
    if (!isScheduled && ageLocked) {
      toast.error(
        "This post is older than 24 hours - Auto-Plug can no longer be edited.",
      );
      return;
    }
    setSavingPlug(true);
    try {
      if (isScheduled) {
        const r = await updateScheduledPostAutoFeatures(postId, {
          autoPlugConfig: draftPlug,
          resurfaceConfig: toFullResurface(pendingResurfaceFromServer),
        });
        if (!r.success) {
          toast.error(r.error);
          return;
        }
        toast.success("Auto-Plug saved");
        setPlugModalOpen(false);
        refresh();
        return;
      }
      if (autoPlugDetail?.status === "watching") {
        const r = await updateAutoPlug(postId, draftPlug);
        if (!r.success) {
          toast.error(r.error);
          return;
        }
      } else if (!autoPlugDetail && withinAuto) {
        const r = await createAutoPlug(postId, null, draftPlug);
        if (!r.success) {
          toast.error(r.error);
          return;
        }
      } else {
        toast.error("Auto-Plug can’t be added outside the time window.");
        return;
      }
      toast.success("Auto-Plug saved");
      setPlugModalOpen(false);
      refresh();
    } finally {
      setSavingPlug(false);
    }
  }, [
    ageLocked,
    autoPlugDetail,
    draftPlug,
    isScheduled,
    pendingResurfaceFromServer,
    postId,
    refresh,
    withinAuto,
  ]);

  const handleSaveResurfaceModal = useCallback(async () => {
    if (!draftResurface) {
      toast.error("Fill in Auto-Repost settings.");
      return;
    }
    if (!isScheduled && ageLocked) {
      toast.error(
        "This post is older than 24 hours - Auto-Repost can no longer be edited.",
      );
      return;
    }
    setSavingResurface(true);
    try {
      if (isScheduled) {
        const r = await updateScheduledPostAutoFeatures(postId, {
          autoPlugConfig: toFullAutoPlug(pendingAutoPlugFromServer),
          resurfaceConfig: draftResurface,
        });
        if (!r.success) {
          toast.error(r.error);
          return;
        }
        toast.success("Auto-Repost saved");
        setResurfaceModalOpen(false);
        refresh();
        return;
      }
      if (resurfaceDetail) {
        const r = await updateResurfaceSchedule(resurfaceDetail.id, {
          intervalHours: draftResurface.intervalHours,
          maxResurfaces: draftResurface.maxResurfaces,
          plugComment: draftResurface.plugComment || null,
          isActive: true,
        });
        if (!r.success) {
          toast.error(r.error);
          return;
        }
      } else if (withinResurface) {
        const r = await createResurfaceSchedule(
          postId,
          getResurfacePlatformForApi("twitter_x"),
          draftResurface.intervalHours,
          draftResurface.maxResurfaces,
          draftResurface.plugComment || null,
        );
        if (!r.success) {
          toast.error(r.error);
          return;
        }
      } else {
        toast.error("Auto-Repost can’t be added outside the time window.");
        return;
      }
      toast.success("Auto-Repost saved");
      setResurfaceModalOpen(false);
      refresh();
    } finally {
      setSavingResurface(false);
    }
  }, [
    ageLocked,
    draftResurface,
    isScheduled,
    pendingAutoPlugFromServer,
    postId,
    refresh,
    resurfaceDetail,
    withinResurface,
  ]);

  const handlePlugToggle = useCallback(async () => {
    if (plugEditLocked || !allowAutoPlug) return;
    if (isScheduled) {
      if (toFullAutoPlug(pendingAutoPlugFromServer)) {
        setTogglingPlug(true);
        try {
          const r = await updateScheduledPostAutoFeatures(postId, {
            autoPlugConfig: null,
            resurfaceConfig: toFullResurface(pendingResurfaceFromServer),
          });
          if (!r.success) {
            toast.error(r.error);
            return;
          }
          toast.success("Auto-Plug turned off");
          refresh();
        } finally {
          setTogglingPlug(false);
        }
        return;
      }
      setDraftPlug(null);
      setPlugModalOpen(true);
      return;
    }
    if (autoPlugDetail?.status === "watching") {
      setTogglingPlug(true);
      try {
        const r = await cancelAutoPlug(postId);
        if (!r.success) {
          toast.error(r.error);
          return;
        }
        toast.success("Auto-Plug turned off");
        refresh();
      } finally {
        setTogglingPlug(false);
      }
      return;
    }
    if (!withinAuto && !autoPlugDetail) {
      toast.error("Auto-Plug can only be added within 6 hours of publishing.");
      return;
    }
    setDraftPlug(null);
    setPlugModalOpen(true);
  }, [
    allowAutoPlug,
    autoPlugDetail,
    isScheduled,
    pendingAutoPlugFromServer,
    pendingResurfaceFromServer,
    plugEditLocked,
    postId,
    refresh,
    withinAuto,
  ]);

  const handleResurfaceToggle = useCallback(async () => {
    if (repostEditLocked || !allowResurface) return;
    if (isScheduled) {
      if (toFullResurface(pendingResurfaceFromServer)) {
        setTogglingResurface(true);
        try {
          const r = await updateScheduledPostAutoFeatures(postId, {
            autoPlugConfig: toFullAutoPlug(pendingAutoPlugFromServer),
            resurfaceConfig: null,
          });
          if (!r.success) {
            toast.error(r.error);
            return;
          }
          toast.success("Auto-Repost turned off");
          refresh();
        } finally {
          setTogglingResurface(false);
        }
        return;
      }
      setDraftResurface(null);
      setResurfaceModalOpen(true);
      return;
    }
    if (resurfaceDetail && resurfaceDetail.isActive) {
      setTogglingResurface(true);
      try {
        const r = await disableResurfaceSchedule(resurfaceDetail.id);
        if (!r.success) {
          toast.error(r.error);
          return;
        }
        toast.success("Auto-Repost paused");
        refresh();
      } finally {
        setTogglingResurface(false);
      }
      return;
    }
    if (!withinResurface && !resurfaceDetail) {
      toast.error(
        "Auto-Repost can only be added within 24 hours of publishing.",
      );
      return;
    }
    setDraftResurface(null);
    setResurfaceModalOpen(true);
  }, [
    allowResurface,
    isScheduled,
    pendingAutoPlugFromServer,
    pendingResurfaceFromServer,
    repostEditLocked,
    resurfaceDetail,
    refresh,
    withinResurface,
  ]);

  const openPlugSettings = useCallback(() => {
    if (plugEditLocked || !allowAutoPlug) return;
    setPlugModalOpen(true);
  }, [allowAutoPlug, plugEditLocked]);

  const openResurfaceSettings = useCallback(() => {
    if (repostEditLocked || !allowResurface) return;
    setResurfaceModalOpen(true);
  }, [allowResurface, repostEditLocked]);

  if (loading) {
    return <PostDetailAutoFeaturesSkeleton />;
  }

  if (selectedAccountIds.length === 0) {
    return null;
  }

  const showSection = isScheduled
    ? allowAutoPlug || allowResurface
    : allowAutoPlug ||
      allowResurface ||
      autoPlugDetail ||
      resurfaceDetail ||
      withinAuto ||
      withinResurface;

  if (!showSection) {
    return null;
  }

  const plugGearVisible =
    allowAutoPlug &&
    !plugEditLocked &&
    (isScheduled ? plugToggleOn : autoPlugDetail?.status === "watching");

  const resurfaceGearVisible =
    allowResurface && !repostEditLocked && resurfaceToggleOn;

  return (
    <div className="rounded-2xl border border-border/80 bg-bg-elevated p-5 shadow-sm space-y-4 dark:border-white/8 dark:bg-[#121212]/95 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Auto-Plug &amp; Auto-Repost
        </h2>
        <p className="text-[13px] leading-snug text-muted-foreground">
          Same controls as the composer. Toggle on or off; the gear opens
          details.
        </p>
        {ageLocked && (
          <p className="text-[13px] text-muted-foreground pt-0.5">
            This post was published more than 24 hours ago - Auto-Plug and
            Auto-Repost can no longer be edited.
          </p>
        )}
      </div>

      {(!allowAutoPlug || !allowResurface) && (
        <p className="text-xs text-muted-foreground">
          Growth plan features.{" "}
          <Link
            href="/dashboard/billing"
            className="font-medium text-accent hover:underline"
          >
            View billing
          </Link>
        </p>
      )}

      <div className="space-y-2">
        {resurfaceRowVisible && (
          <FeatureRowShell>
            <div className="flex flex-col gap-0.5 min-w-0 pr-2">
              <span className="text-sm font-medium text-foreground truncate">
                Auto-Repost
              </span>
              <span className="text-xs text-muted-foreground">
                (Twitter/X only)
              </span>
              {repostLocked && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400/90 mt-0.5">
                  Already ran - locked
                </span>
              )}
              {!allowResurface && (
                <Link
                  href="/dashboard/billing"
                  className="text-xs text-accent hover:text-accent-hover mt-0.5 w-fit"
                >
                  Upgrade to use
                </Link>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {allowResurface && !repostEditLocked ? (
                <>
                  {resurfaceGearVisible && (
                    <button
                      type="button"
                      onClick={openResurfaceSettings}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                      aria-label="Auto-Repost settings"
                    >
                      <Settings className="h-4 w-4 stroke-[1.5]" />
                    </button>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={resurfaceToggleOn}
                    aria-label={
                      resurfaceToggleOn
                        ? "Disable Auto-Repost"
                        : "Enable Auto-Repost"
                    }
                    disabled={togglingResurface}
                    onClick={() => void handleResurfaceToggle()}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                      resurfaceToggleOn ? TOGGLE_ON : TOGGLE_OFF,
                      "disabled:opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full shadow-md transition-transform mt-0.5",
                        resurfaceToggleOn
                          ? "translate-x-4 bg-neutral-50 dark:bg-neutral-900"
                          : "translate-x-0.5 bg-white dark:bg-neutral-200",
                      )}
                    />
                  </button>
                </>
              ) : (
                <span
                  role="switch"
                  aria-checked={resurfaceToggleOn}
                  aria-disabled="true"
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 rounded-full opacity-55 cursor-not-allowed",
                    resurfaceToggleOn ? TOGGLE_ON : TOGGLE_OFF,
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full shadow-md mt-0.5",
                      resurfaceToggleOn
                        ? "translate-x-4 bg-neutral-50 dark:bg-neutral-900"
                        : "translate-x-0.5 bg-white dark:bg-neutral-200",
                    )}
                  />
                </span>
              )}
            </div>
          </FeatureRowShell>
        )}

        {autoPlugRowVisible && (
          <FeatureRowShell>
            <div className="flex flex-col gap-0.5 min-w-0 pr-2">
              <span className="text-sm font-medium text-foreground truncate">
                Auto-Plug
              </span>
              <span className="text-xs text-muted-foreground">
                (Twitter/X only)
              </span>
              {plugLocked && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400/90 mt-0.5">
                  {autoPlugDetail?.status === "triggered"
                    ? "Already sent - locked"
                    : "No longer editable"}
                </span>
              )}
              {!allowAutoPlug && (
                <Link
                  href="/dashboard/billing"
                  className="text-xs text-accent hover:text-accent-hover mt-0.5 w-fit"
                >
                  Upgrade to use
                </Link>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {allowAutoPlug && !plugEditLocked ? (
                <>
                  {plugGearVisible && (
                    <button
                      type="button"
                      onClick={openPlugSettings}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                      aria-label="Auto-Plug settings"
                    >
                      <Settings className="h-4 w-4 stroke-[1.5]" />
                    </button>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={plugToggleOn}
                    aria-label={
                      plugToggleOn ? "Disable Auto-Plug" : "Enable Auto-Plug"
                    }
                    disabled={togglingPlug}
                    onClick={() => void handlePlugToggle()}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                      plugToggleOn ? TOGGLE_ON : TOGGLE_OFF,
                      "disabled:opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full shadow-md transition-transform mt-0.5",
                        plugToggleOn
                          ? "translate-x-4 bg-neutral-50 dark:bg-neutral-900"
                          : "translate-x-0.5 bg-white dark:bg-neutral-200",
                      )}
                    />
                  </button>
                </>
              ) : (
                <span
                  role="switch"
                  aria-checked={plugToggleOn}
                  aria-disabled="true"
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 rounded-full opacity-55 cursor-not-allowed",
                    plugToggleOn ? TOGGLE_ON : TOGGLE_OFF,
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full shadow-md mt-0.5",
                      plugToggleOn
                        ? "translate-x-4 bg-neutral-50 dark:bg-neutral-900"
                        : "translate-x-0.5 bg-white dark:bg-neutral-200",
                    )}
                  />
                </span>
              )}
            </div>
          </FeatureRowShell>
        )}
      </div>

      <Dialog open={plugModalOpen} onOpenChange={setPlugModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto border-border bg-bg-elevated">
          <DialogHeader>
            <DialogTitle>
              {plugToggleOn &&
              (isScheduled || autoPlugDetail?.status === "watching")
                ? "Edit Auto-Plug"
                : "Auto-Plug"}
            </DialogTitle>
          </DialogHeader>
          <AutoPlugPanel
            selectedAccountIds={selectedAccountIds}
            allAccounts={accounts}
            postId={postId}
            publishedAt={pub ?? undefined}
            onChange={setDraftPlug}
            initialConfig={plugInitial ?? undefined}
            modalMode
            ignorePublicationTimeWindow
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPlugModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!draftPlug || savingPlug}
              onClick={() => void handleSavePlugModal()}
            >
              {savingPlug ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resurfaceModalOpen} onOpenChange={setResurfaceModalOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto border-border bg-bg-elevated">
          <DialogHeader>
            <DialogTitle>
              {resurfaceToggleOn && (isScheduled || !!resurfaceDetail)
                ? "Edit Auto-Repost"
                : "Auto-Repost"}
            </DialogTitle>
          </DialogHeader>
          <AutoResurfacePanel
            selectedAccountIds={selectedAccountIds}
            allAccounts={accounts}
            postId={postId}
            publishedAt={pub ?? undefined}
            onChange={setDraftResurface}
            initialConfig={resurfaceInitial ?? undefined}
            modalMode
            ignorePublicationTimeWindow
            use24HourTimeFormat={use24HourTimeFormat}
            initialEnabled={
              resurfaceDetail && !resurfaceDetail.isActive ? false : undefined
            }
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResurfaceModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!draftResurface || savingResurface}
              onClick={() => void handleSaveResurfaceModal()}
            >
              {savingResurface ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
