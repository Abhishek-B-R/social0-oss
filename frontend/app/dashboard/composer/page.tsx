import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ComposerClient } from "./ComposerClient";

export default async function ComposerPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  return (
    <div className="relative px-4 sm:px-6 lg:px-10">
      <ComposerClient />
    </div>
  );
}
