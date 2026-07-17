import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getContentTypeBySlug } from "@/lib/content-types";
import { getPlanLimits, type SubscriptionTier } from "@/lib/plans";
import type { DateFormatKey } from "@/lib/date-format";
import {
  DOCS_COLLECTION_POST_TYPE_URL,
  DOCS_CREATE_TYPE_URL,
  DOCS_IMAGE_POST_TYPE_URL,
  DOCS_TEXT_POST_TYPE_URL,
  DOCS_THREADS_POST_TYPE_URL,
  DOCS_VIDEO_POST_TYPE_URL,
} from "@/lib/docs-url";
import DocsInfoIcon from "@/components/info-icon";
import { CreatePostWithAccounts } from "@/features/dashboard/create/CreatePostWithAccounts";
import { useSession } from "@/lib/auth-client";
import { useIsGuest } from "@/lib/use-is-guest";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { rpc } from "@/lib/rpc";
import { getUserSettingsSnapshot } from "@/api/settings";

export function CreateTypePage() {
  const { type: typeSlug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const { data: session } = useSession();
  const isGuest = useIsGuest();

  const contentType = getContentTypeBySlug(typeSlug);

  const { data: composerSettings } = useQuery({
    queryKey: ["composer-settings"],
    queryFn: () =>
      rpc<{
        subscriptionTier: SubscriptionTier;
        subscriptionExpiresAt: string | null;
        freePostsUsed: number;
      }>("dashboard-data.loadComposerSettings"),
    enabled: !!session,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings-snapshot"],
    queryFn: getUserSettingsSnapshot,
    enabled: !!session,
  });

  useEffect(() => {
    if (!contentType) navigate(dash("create"), { replace: true });
  }, [contentType, navigate, dash]);

  if (!contentType) return null;

  const rawTier = composerSettings?.subscriptionTier ?? "free";
  const subExpiresAt = composerSettings?.subscriptionExpiresAt ?? null;
  const effectiveTier: SubscriptionTier =
    subExpiresAt && new Date(subExpiresAt) < new Date()
      ? "free"
      : rawTier === "starter" || rawTier === "growth" || rawTier === "pro"
        ? rawTier
        : "free";
  const planLimits = getPlanLimits(effectiveTier);
  const dateFormat = (settings?.dateFormat ?? "dd/MM/yyyy") as DateFormatKey;

  const url =
    contentType.slug === "collection"
      ? DOCS_COLLECTION_POST_TYPE_URL
      : contentType.slug === "video"
        ? DOCS_VIDEO_POST_TYPE_URL
        : contentType.slug === "text"
          ? DOCS_TEXT_POST_TYPE_URL
          : contentType.slug === "image"
            ? DOCS_IMAGE_POST_TYPE_URL
            : contentType.slug === "threads"
              ? DOCS_THREADS_POST_TYPE_URL
              : DOCS_CREATE_TYPE_URL;

  return (
    <div>
      <div className="flex items-center gap-2 mb-16">
        <h2 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
          {contentType.name}
        </h2>
        <DocsInfoIcon url={url} />
      </div>
      <CreatePostWithAccounts
        contentTypeSlug={contentType.slug as "text" | "image" | "video" | "threads" | "collection"}
        supportedPlatforms={[...contentType.platforms]}
        use24HourTimeFormat={settings?.use24HourTimeFormat ?? false}
        dateFormat={dateFormat}
        timezone={settings?.timezone ?? "UTC"}
        draftId={searchParams.get("draft") ?? undefined}
        scheduledId={searchParams.get("scheduled") ?? undefined}
        editId={searchParams.get("edit") ?? undefined}
        allowAutoRepost={planLimits.allowResurface}
        allowAutoPlug={planLimits.allowAutoPlug}
        subscriptionTier={effectiveTier}
        freePostsUsed={composerSettings?.freePostsUsed ?? 0}
        isGuest={isGuest}
      />
    </div>
  );
}
