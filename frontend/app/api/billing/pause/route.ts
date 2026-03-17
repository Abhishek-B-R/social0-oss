import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const months = body.months as number | undefined;
  if (months !== 1 && months !== 2 && months !== 3) {
    return NextResponse.json({ error: "Invalid months" }, { status: 400 });
  }

  // Dodo SDK currently doesn't expose a pause endpoint; direct users to feedback/support.
  return NextResponse.json(
    { error: "not_supported" },
    { status: 501 },
  );
}

