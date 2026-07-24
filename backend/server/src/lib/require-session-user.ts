import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers, cookies } from "./http/request-cookies.js";
import { redirect } from "./http/route-redirect.js";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

const BETTER_AUTH_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "better-auth.session_data",
  "__Secure-better-auth.session_data",
] as const;

async function clearBetterAuthCookies(): Promise<void> {
  try {
    const jar = await cookies();
    for (const name of BETTER_AUTH_COOKIE_NAMES) {
      jar.delete(name);
    }
  } catch {
    /* request context may be missing outside RPC */
  }
}

/** Session from Better Auth cookie cache can outlive the Postgres user row (e.g. after delete / DB reset). */
export async function requireSessionUser(): Promise<Session> {
  const sessionHeaders = await headers();
  const session = await auth.api.getSession({
    headers: sessionHeaders,
    query: { disableCookieCache: true },
  });
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
      // Best effort - cookie may already be invalid in the database.
    }
    try {
      await auth.api.signOut({ headers: sessionHeaders });
    } catch {
      /* ignore */
    }
    await clearBetterAuthCookies();
    redirect("/auth?session=expired");
  }

  return session;
}

export async function requireSessionUserId(): Promise<string> {
  const session = await requireSessionUser();
  return session.user.id;
}
