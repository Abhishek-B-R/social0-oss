import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { PLATFORMS } from "@/lib/platforms";
import { getContentTypeBySlug } from "@/lib/content-types";
import { NEVER_EXPIRES_PLATFORMS } from "@/lib/token-health";
import { getPlanLimits } from "@/lib/plans";
import type { SubscriptionTier } from "@/lib/plans";
import type { DateFormatKey } from "@/lib/date-format";
import { TextPostForm } from "../forms/TextPostForm";
import { ImagePostForm } from "../forms/ImagePostForm";
import { VideoPostForm } from "../forms/VideoPostForm";
import { ThreadsPostForm } from "../forms/ThreadsPostForm";
import { CollectionPostForm } from "../forms/CollectionPostForm";

const platformOrder: string[] = PLATFORMS.map((p) => p.id);
function sortAccountsByPlatformOrder<T extends { platform: string }>(
  accounts: T[],
): T[] {
  return [...accounts].sort(
    (a, b) =>
      platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform),
  );
}

const FORM_MAP = {
  text: TextPostForm,
  image: ImagePostForm,
  video: VideoPostForm,
  threads: ThreadsPostForm,
  collection: CollectionPostForm,
} as const;

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

  const [accounts, settingsRow] = await Promise.all([
    db.query.connectedAccounts.findMany({
      where: eq(connectedAccounts.userId, session.user.id),
      columns: {
        id: true,
        platform: true,
        platformUsername: true,
        profileImageUrl: true,
        isActive: true,
        tokenExpiresAt: true,
        tokenStatus: true,
        platformMetadata: true,
        isTwitterPremium: true,
      },
    }),
    db.query.userSettings.findFirst({
      where: eq(userSettings.userId, session.user.id),
      columns: {
        use24HourTimeFormat: true,
        dateFormat: true,
        timezone: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
      },
    }),
  ]);

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const skipExpiryDisplay = new Set(["youtube", "tiktok"]);
  const allowedPlatforms = new Set(contentType.platforms);
  const filtered = sortAccountsByPlatformOrder(
    accounts
      .filter((a) => a.isActive !== false && allowedPlatforms.has(a.platform))
      .map((a) => ({
        id: a.id,
        platform: a.platform,
        platformUsername: a.platformUsername,
        profileImageUrl: a.profileImageUrl,
        isActive: a.isActive,
        isTwitterPremium: a.isTwitterPremium ?? false,
        tokenExpired: NEVER_EXPIRES_PLATFORMS.has(a.platform)
          ? false
          : a.tokenStatus === "expired" ||
            (!skipExpiryDisplay.has(a.platform) &&
              !!a.tokenExpiresAt &&
              new Date(a.tokenExpiresAt).getTime() < now),
        platformMetadata: a.platformMetadata ?? undefined,
      })),
  );

  const rawDateFormat = settingsRow?.dateFormat as DateFormatKey | null | undefined;
  const use24HourTimeFormat = settingsRow?.use24HourTimeFormat ?? false;
  const dateFormat: DateFormatKey =
    rawDateFormat === "dd/MM/yyyy" ||
    rawDateFormat === "MM/dd/yyyy" ||
    rawDateFormat === "yyyy-MM-dd"
      ? rawDateFormat
      : "dd/MM/yyyy";
  const timezone =
    typeof settingsRow?.timezone === "string" && settingsRow.timezone.trim().length > 0
      ? settingsRow.timezone.trim()
      : "UTC";

  const rawTier = (settingsRow?.subscriptionTier as SubscriptionTier) ?? "free";
  const subExpiresAt = settingsRow?.subscriptionExpiresAt ?? null;
  const effectiveTier: SubscriptionTier =
    subExpiresAt && new Date(subExpiresAt) < new Date()
      ? "free"
      : rawTier === "starter" || rawTier === "growth"
        ? rawTier
        : "free";
  const planLimits = getPlanLimits(effectiveTier);

  const FormComponent = FORM_MAP[contentType.slug];

  return (
    <div>
      <h2 className="text-2xl font-extrabold text-text mb-16">
        {contentType.name}
      </h2>
      <FormComponent
        accounts={filtered}
        use24HourTimeFormat={use24HourTimeFormat}
        dateFormat={dateFormat}
        timezone={timezone}
        draftId={draftId ?? undefined}
        scheduledId={scheduledId ?? undefined}
        editId={editId ?? undefined}
        allowAutoRepost={planLimits.allowResurface}
        allowAutoPlug={planLimits.allowAutoPlug}
        supportedPlatforms={[...contentType.platforms]}
      />
    </div>
  );
}
