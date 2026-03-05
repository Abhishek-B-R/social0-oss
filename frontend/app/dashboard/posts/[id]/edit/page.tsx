import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getPostForEdit, getPostMedia } from "../../posts-list-data";
import { EditPostForm } from "../../EditPostForm";
import { PLATFORMS } from "@/lib/platforms";
import { NEVER_EXPIRES_PLATFORMS } from "@/lib/token-health";
import { getUserSettingsSnapshot } from "@/app/actions/settings";

const platformOrder: string[] = PLATFORMS.map((p) => p.id);

function sortAccountsByPlatform<T extends { platform: string }>(accounts: T[]): T[] {
  return [...accounts].sort(
    (a, b) =>
      platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform),
  );
}

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const { id } = await params;
  const post = await getPostForEdit(id, session.user.id);
  if (!post) notFound();

  if (post.status !== "draft" && post.status !== "scheduled") {
    notFound();
  }

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
      isTwitterPremium: true,
    },
  });

  const now = Date.now();
  const skipExpiryDisplay = new Set(["youtube", "tiktok"]);
  const activeAccounts = sortAccountsByPlatform(
    accounts
      .filter((a) => a.isActive !== false)
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
      })),
  );

  const existingMedia =
    post.mediaIds && post.mediaIds.length > 0
      ? await getPostMedia(session.user.id, post.mediaIds)
      : [];

  const { use24HourTimeFormat } = await getUserSettingsSnapshot();

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/dashboard/posts"
          className="text-sm font-medium text-text-muted hover:text-text transition-colors"
        >
          ← Back to Posts
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-sm font-medium text-text">Edit post</span>
      </div>
      <h2 className="text-2xl font-extrabold text-text mb-2">
        Edit post
      </h2>
      <p className="text-gray-500 mb-8 font-medium">
        Update content, accounts, or scheduled time.
      </p>
      <EditPostForm
        post={post}
        accounts={activeAccounts}
        existingMedia={existingMedia}
        use24HourTimeFormat={use24HourTimeFormat}
      />
    </div>
  );
}
