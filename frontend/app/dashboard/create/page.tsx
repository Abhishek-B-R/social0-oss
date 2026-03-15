import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NewPostTypeSelector } from "./NewPostTypeSelector";
import { MdQuestionMark } from "react-icons/md";
import { DOCS_CREATE_TYPE_URL } from "@/lib/docs-url";

export default async function NewPostPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  return (
    <div className="px-10">
      <a
        href={DOCS_CREATE_TYPE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <MdQuestionMark className="h-4 w-4" />
      </a>
      <div className="mb-6">
        <Link
          href="/dashboard/posts"
          className="text-sm font-medium text-text-muted hover:text-text transition-colors"
        >
          ← Back to Posts
        </Link>
      </div>
      <h2 className="text-2xl font-extrabold text-text mb-2">Do it manually</h2>
      <p className="text-text-muted mb-8 font-medium">
        Select your preferred content type below and we&apos;ll take you to the
        right form.
      </p>
      <NewPostTypeSelector />
    </div>
  );
}
