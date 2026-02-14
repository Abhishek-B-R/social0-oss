import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PLATFORMS } from "@/lib/platforms";
import { NewPostForm } from "./NewPostForm";
import Link from "next/link";

const platformOrder: string[] = PLATFORMS.map((p) => p.id);
function sortAccountsByPlatformOrder<T extends { platform: string }>(accounts: T[]): T[] {
  return [...accounts].sort(
    (a, b) => platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform),
  );
}

export default async function NewPostPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const accounts = await db.query.connectedAccounts.findMany({
    where: eq(connectedAccounts.userId, session.user.id),
    columns: {
      id: true,
      platform: true,
      platformUsername: true,
      profileImageUrl: true,
      isActive: true,
    },
  });

  const activeAccounts = sortAccountsByPlatformOrder(
    accounts.filter((a) => a.isActive !== false),
  );

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
        New post
      </h2>
      <p className="text-gray-500 mb-8 font-medium">
        Write your content, choose when to publish, and pick your platforms.
      </p>
      <NewPostForm accounts={activeAccounts} />
    </div>
  );
}
