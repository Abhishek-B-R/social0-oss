import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

// Only usable in development - returns 404 in production so it's a no-op if
// ever deployed accidentally.
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not set - add it to .env.local" },
      { status: 503 },
    );
  }

  const authHeader = { Authorization: `Bearer ${cronSecret}` };
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const [publishRes, repostRes, autoplugRes] = await Promise.allSettled([
    fetch(`${base}/api/cron/publish-scheduled`, { headers: authHeader }),
    fetch(`${base}/api/cron/repost`, { headers: authHeader }),
    fetch(`${base}/api/cron/autoplug`, { headers: authHeader }),
  ]);

  const result = async (r: PromiseSettledResult<Response>) => {
    if (r.status === "rejected") return { error: String(r.reason) };
    try {
      return await r.value.json();
    } catch {
      return { error: `HTTP ${r.value.status}` };
    }
  };

  return NextResponse.json({
    publishScheduled: await result(publishRes),
    repost: await result(repostRes),
    autoplug: await result(autoplugRes),
  });
}
