import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { oauthLimiter, enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(oauthLimiter, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: rate.error }, { status: rate.status });
  }

  const payload = {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
  };

  const token = jwt.sign(payload, env.CANNY_PRIVATE_KEY, {
    algorithm: "HS256",
    expiresIn: "1h",
  });

  return NextResponse.json({ token });
}
