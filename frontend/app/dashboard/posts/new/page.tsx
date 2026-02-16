import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NewPostTypeSelector } from "./NewPostTypeSelector";

export default async function NewPostPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/posts"
          className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          ← Back to Posts
        </Link>
      </div>
      <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
        Create a new post
      </h2>
      <p className="text-gray-500 mb-8 font-medium">
        Choose a content type to get started.
      </p>
      <NewPostTypeSelector />
    </div>
  );
}
