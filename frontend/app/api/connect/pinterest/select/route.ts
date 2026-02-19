import { auth } from "@/lib/auth";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { decryptToken } from "@/lib/encryption";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }
  const record = await db.query.verification.findFirst({
    where: eq(verification.id, token),
  });
  if (!record || record.identifier !== "pinterest_boards") {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }
  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }
  try {
    const payload = JSON.parse(decryptToken(record.value, token));
    if (payload.userId !== session.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }
    const rawBoards = Array.isArray(payload.boards) ? payload.boards : [];
    const boards = rawBoards.map((b: { id?: string; name?: string }) => ({
      id: String(b?.id ?? ""),
      name: String(b?.name ?? b?.id ?? ""),
    }));
    return Response.json({ boards });
  } catch {
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }
}
