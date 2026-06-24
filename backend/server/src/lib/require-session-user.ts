import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** Session from Better Auth cookie cache can outlive the Postgres user row (e.g. after a DB reset). */
export async function requireSessionUser(): Promise<Session> {
  const sessionHeaders = await headers();
  const session = await auth.api.getSession({ headers: sessionHeaders });
  if (!session?.user.id) {
    redirect("/auth");
  }

  const dbUser = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { id: true },
  });

  if (!dbUser) {
    try {
      await auth.api.revokeSessions({ headers: sessionHeaders });
    } catch {
      // Best effort — cookie may already be invalid in the database.
    }
    redirect("/auth?session=expired");
  }

  return session;
}

export async function requireSessionUserId(): Promise<string> {
  const session = await requireSessionUser();
  return session.user.id;
}
