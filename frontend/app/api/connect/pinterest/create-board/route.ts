import { auth } from "@/lib/auth";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { decryptToken, encryptToken } from "@/lib/encryption";
import { NextRequest } from "next/server";

type PrivacyInput = "PUBLIC" | "PRIVATE";

function toPinterestPrivacy(p: PrivacyInput): "PUBLIC" | "SECRET" {
  return p === "PRIVATE" ? "SECRET" : "PUBLIC";
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { tokenId?: string; name?: string; privacy?: PrivacyInput };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const tokenId = body.tokenId;
  const name = (body.name ?? "").trim();
  const privacy = body.privacy;
  if (!tokenId || !name || (privacy !== "PUBLIC" && privacy !== "PRIVATE")) {
    return Response.json(
      { error: "tokenId, name, and privacy (PUBLIC|PRIVATE) are required" },
      { status: 400 },
    );
  }

  const record = await db.query.verification.findFirst({
    where: eq(verification.id, tokenId),
  });
  if (!record || record.identifier !== "pinterest_create_board") {
    return Response.json(
      { error: "Invalid or expired token" },
      { status: 400 },
    );
  }
  if (new Date(record.expiresAt) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 400 });
  }

  let payload: {
    userId: string;
    access_token: string;
    refresh_token: string | null;
    expires_in: number | null;
  };

  try {
    payload = JSON.parse(decryptToken(record.value, tokenId));
  } catch {
    return Response.json({ error: "Invalid token data" }, { status: 400 });
  }

  if (payload.userId !== session.user.id) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Create board in Pinterest sandbox
  const createRes = await fetch("https://api-sandbox.pinterest.com/v5/boards", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${payload.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      privacy: toPinterestPrivacy(privacy),
    }),
  });

  const createData = (await createRes.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    message?: string;
  };

  if (!createRes.ok) {
    return Response.json(
      {
        error:
          createData.message ??
          `Failed to create board (HTTP ${createRes.status})`,
      },
      { status: 400 },
    );
  }

  // Sandbox can be eventually consistent: don't rely on immediate GET /boards.
  // Use the created board directly for the selection step.
  if (!createData.id) {
    return Response.json(
      {
        error:
          "Board created, but Pinterest did not return a board id. Try again.",
      },
      { status: 400 },
    );
  }

  const nextPayload = JSON.stringify({
    userId: payload.userId,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || null,
    expires_in: payload.expires_in || null,
    boards: [{ id: createData.id, name: createData.name ?? name }],
  });

  await db
    .update(verification)
    .set({
      identifier: "pinterest_boards",
      value: encryptToken(nextPayload, tokenId),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    })
    .where(eq(verification.id, tokenId));

  return Response.json({
    success: true,
    created: { id: createData.id ?? null, name: createData.name ?? name },
  });
}
