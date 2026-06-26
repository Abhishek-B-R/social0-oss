import { auth } from "@/lib/auth";
import { getLegalStatus } from "@/lib/legal";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getLegalStatus(session.user.id);
  return NextResponse.json(status);
}
