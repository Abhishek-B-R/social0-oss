import { auth } from "@/lib/auth";
import { db } from "@/db";
import { posts, postPublications, connectedAccounts } from "@/db/schema";
import { eq, inArray, and, or } from "drizzle-orm";
import { headers } from "next/headers";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { CalendarClient, type PostForCalendar } from "./CalendarClient";
import { format, subMonths, addMonths } from "date-fns";

export default async function CalendarPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const { use24HourTimeFormat } = await getUserSettingsSnapshot();
  const now = new Date();
  const rangeStart = subMonths(now, 1);
  const rangeEnd = addMonths(now, 2);

  const userPosts = await db
    .select({
      id: posts.id,
      originalContent: posts.originalContent,
      status: posts.status,
      scheduledAt: posts.scheduledAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(
      and(
        eq(posts.userId, session.user.id),
        or(
          eq(posts.status, "scheduled"),
          eq(posts.status, "published")
        )
      )
    );

  const postIds = userPosts.map((p) => p.id);
  if (postIds.length === 0) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <h1 className="text-2xl font-extrabold text-text">Calendar</h1>
        <p className="mt-2 text-text-muted">
          View your scheduled and published posts by month, week, or day.
        </p>
        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <CalendarClient posts={[]} initialMonth={format(now, "yyyy-MM")} use24HourTimeFormat={use24HourTimeFormat} />
        </div>
      </div>
    );
  }

  const publications = await db
    .select({
      postId: postPublications.postId,
      publishedAt: postPublications.publishedAt,
      platform: connectedAccounts.platform,
      profileImageUrl: connectedAccounts.profileImageUrl,
      platformUsername: connectedAccounts.platformUsername,
      isTwitterPremium: connectedAccounts.isTwitterPremium,
    })
    .from(postPublications)
    .innerJoin(
      connectedAccounts,
      eq(postPublications.connectedAccountId, connectedAccounts.id)
    )
    .where(inArray(postPublications.postId, postIds));

  const firstPublicationByPost = new Map<
    string,
    {
      publishedAt: Date | null;
      platform: string;
      profileImageUrl: string | null;
      platformUsername: string | null;
      isTwitterPremium: boolean | null;
    }
  >();
  for (const pub of publications) {
    const existing = firstPublicationByPost.get(pub.postId);
    const pubAt = pub.publishedAt ? new Date(pub.publishedAt) : null;
    if (
      !existing ||
      (pubAt && (!existing.publishedAt || pubAt < existing.publishedAt))
    ) {
      firstPublicationByPost.set(pub.postId, {
        publishedAt: pubAt,
        platform: pub.platform,
        profileImageUrl: pub.profileImageUrl,
        platformUsername: pub.platformUsername,
        isTwitterPremium: pub.isTwitterPremium,
      });
    }
  }

  const calendarPosts: PostForCalendar[] = [];
  for (const post of userPosts) {
    const displayDate =
      post.status === "scheduled" && post.scheduledAt
        ? new Date(post.scheduledAt)
        : firstPublicationByPost.get(post.id)?.publishedAt ??
          post.createdAt ??
          new Date();
    if (displayDate < rangeStart || displayDate > rangeEnd) continue;
    const firstPub = firstPublicationByPost.get(post.id);
    calendarPosts.push({
      id: post.id,
      snippet:
        post.originalContent?.slice(0, 40).trim() ||
        "(No caption)",
      status: post.status ?? "scheduled",
      displayDate: displayDate.toISOString(),
      platform: firstPub?.platform ?? null,
      profileImageUrl: firstPub?.profileImageUrl ?? null,
      platformUsername: firstPub?.platformUsername ?? null,
      isTwitterPremium: firstPub?.isTwitterPremium ?? null,
    });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <h1 className="text-2xl font-extrabold text-text">Calendar</h1>
      <p className="mt-2 text-text-muted">
        View your scheduled and published posts by month, week, or day.
      </p>
      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <CalendarClient
          posts={calendarPosts}
          initialMonth={format(now, "yyyy-MM")}
          use24HourTimeFormat={use24HourTimeFormat}
        />
      </div>
    </div>
  );
}
