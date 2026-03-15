import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NewPostTypeSelector } from "./NewPostTypeSelector";
import { DOCS_CREATE_TYPE_URL } from "@/lib/docs-url";
import DocsInfoIcon from "@/components/info-icon";

export default async function NewPostPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  return (
    <div className="px-10">
      <div className="flex items-center gap-2">
        <h2 className="text-3xl font-bold font-serif tracking-tight text-foreground mb-2 landing">
          Do it manually
        </h2>
        <DocsInfoIcon url={DOCS_CREATE_TYPE_URL} />
      </div>
      <p className="text-text-muted mb-8 font-medium">
        Select your preferred content type below and we&apos;ll take you to the
        right form.
      </p>
      <NewPostTypeSelector />
    </div>
  );
}
