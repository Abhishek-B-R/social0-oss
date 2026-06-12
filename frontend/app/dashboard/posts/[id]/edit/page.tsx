import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { signInUrl } from "@/lib/sign-in-url";
import Link from "next/link";
import { getPostForEdit, getPostMedia } from "../../posts-list-data";
import { EditPostWithAccountsClient } from "../../EditPostWithAccountsClient";
import { getUserSettingsSnapshot } from "@/app/actions/settings";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([
    params,
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!session) redirect(signInUrl(`/dashboard/posts/${id}/edit`));
  const post = await getPostForEdit(id, session.user.id);
  if (!post) notFound();

  if (post.status !== "draft" && post.status !== "scheduled") {
    notFound();
  }

  const existingMedia =
    post.mediaIds && post.mediaIds.length > 0
      ? await getPostMedia(session.user.id, post.mediaIds)
      : [];

  const { use24HourTimeFormat, dateFormat } = await getUserSettingsSnapshot();

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
      <h2 className="text-2xl font-extrabold text-text mb-2">Edit post</h2>
      <p className="text-gray-500 mb-8 font-medium">
        Update content, accounts, or scheduled time.
      </p>
      <EditPostWithAccountsClient
        post={post}
        existingMedia={existingMedia}
        use24HourTimeFormat={use24HourTimeFormat}
        dateFormat={dateFormat}
      />
    </div>
  );
}
