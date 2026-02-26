import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { PLATFORMS } from "@/lib/platforms";
import { getContentTypeBySlug } from "@/lib/content-types";
import { NEVER_EXPIRES_PLATFORMS } from "@/lib/token-health";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import Link from "next/link";
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
  searchParams: Promise<{ draft?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const { type: typeSlug } = await params;
  const { draft: draftId } = await searchParams;
  const contentType = getContentTypeBySlug(typeSlug);
  if (!contentType) notFound();

  const accounts = await db.query.connectedAccounts.findMany({
    where: eq(connectedAccounts.userId, session.user.id),
    columns: {
      id: true,
      platform: true,
      platformUsername: true,
      profileImageUrl: true,
      isActive: true,
      tokenExpiresAt: true,
      tokenStatus: true,
    },
  });

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
        tokenExpired: NEVER_EXPIRES_PLATFORMS.has(a.platform)
          ? false
          : !skipExpiryDisplay.has(a.platform) &&
            (a.tokenStatus === "expired" ||
              (!!a.tokenExpiresAt &&
                new Date(a.tokenExpiresAt).getTime() < now)),
      })),
  );

  const FormComponent = FORM_MAP[contentType.slug];
  const { use24HourTimeFormat } = await getUserSettingsSnapshot();

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Link
          href="/dashboard/posts/new"
          className="text-sm font-medium text-text-muted hover:text-text transition-colors"
        >
          ← Back to post types
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-sm font-medium text-text">
          {contentType.name}
        </span>
      </div>
      <h2 className="text-2xl font-extrabold text-text mb-2">
        {contentType.name}
      </h2>
      <p className="text-text-muted mb-8 font-medium">
        {contentType.description}
      </p>
      <FormComponent
        accounts={filtered}
        use24HourTimeFormat={use24HourTimeFormat}
        draftId={draftId ?? undefined}
      />
    </div>
  );
}
