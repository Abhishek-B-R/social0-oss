import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ComposerClient } from "./ComposerClient";
import { DOCS_COMPOSER_URL } from "@/lib/docs-url";
import { MdQuestionMark } from "react-icons/md";

export default async function ComposerPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  return (
    <div className="relative px-4 sm:px-6 lg:px-10">
      <a
        href={DOCS_COMPOSER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <MdQuestionMark className="h-4 w-4" />
      </a>
      <ComposerClient />
    </div>
  );
}
