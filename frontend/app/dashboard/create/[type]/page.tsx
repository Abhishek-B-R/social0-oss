import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getContentTypeBySlug } from "@/lib/content-types";
import { getPlanLimits } from "@/lib/plans";
import type { SubscriptionTier } from "@/lib/plans";
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
import { CreatePostWithAccountsClient } from "../CreatePostWithAccountsClient";

export default async function NewPostByTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ draft?: string; scheduled?: string; edit?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const { type: typeSlug } = await params;
  const rawSearchParams = await searchParams;
  const draftParam = rawSearchParams.draft;
  const draftId =
    typeof draftParam === "string"
      ? draftParam
      : Array.isArray(draftParam) && draftParam[0]
        ? draftParam[0]
        : undefined;
  const scheduledParam = rawSearchParams.scheduled;
  const scheduledId =
    typeof scheduledParam === "string"
      ? scheduledParam
      : Array.isArray(scheduledParam) && scheduledParam[0]
        ? scheduledParam[0]
        : undefined;
  const editParam = rawSearchParams.edit;
  const editId =
    typeof editParam === "string"
      ? editParam
      : Array.isArray(editParam) && editParam[0]
        ? editParam[0]
        : undefined;
  const contentType = getContentTypeBySlug(typeSlug);
  if (!contentType) notFound();

  const settingsRow = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: {
      use24HourTimeFormat: true,
      dateFormat: true,
      timezone: true,
      subscriptionTier: true,
      subscriptionExpiresAt: true,
    },
  });

  const rawDateFormat = settingsRow?.dateFormat as
    | DateFormatKey
    | null
    | undefined;
  const use24HourTimeFormat = settingsRow?.use24HourTimeFormat ?? false;
  const dateFormat: DateFormatKey =
    rawDateFormat === "dd/MM/yyyy" ||
    rawDateFormat === "MM/dd/yyyy" ||
    rawDateFormat === "yyyy-MM-dd"
      ? rawDateFormat
      : "dd/MM/yyyy";
  const timezone =
    typeof settingsRow?.timezone === "string" &&
    settingsRow.timezone.trim().length > 0
      ? settingsRow.timezone.trim()
      : "UTC";

  const rawTier = (settingsRow?.subscriptionTier as SubscriptionTier) ?? "free";
  const subExpiresAt = settingsRow?.subscriptionExpiresAt ?? null;
  const effectiveTier: SubscriptionTier =
    subExpiresAt && new Date(subExpiresAt) < new Date()
      ? "free"
      : rawTier === "starter" || rawTier === "growth" || rawTier === "pro"
        ? rawTier
        : "free";
  const planLimits = getPlanLimits(effectiveTier);

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
      <CreatePostWithAccountsClient
        contentTypeSlug={contentType.slug as "text" | "image" | "video" | "threads" | "collection"}
        supportedPlatforms={[...contentType.platforms]}
        use24HourTimeFormat={use24HourTimeFormat}
        dateFormat={dateFormat}
        timezone={timezone}
        draftId={draftId ?? undefined}
        scheduledId={scheduledId ?? undefined}
        editId={editId ?? undefined}
        allowAutoRepost={planLimits.allowResurface}
        allowAutoPlug={planLimits.allowAutoPlug}
      />
    </div>
  );
}
