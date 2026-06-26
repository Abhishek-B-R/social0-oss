import { env } from "@/lib/env";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const boardToken = env.NEXT_PUBLIC_CANNY_BOARD_TOKEN?.trim() ?? "";
  if (!boardToken) {
    return NextResponse.json(
      { error: "Canny board not configured" },
      { status: 503 },
    );
  }
  return NextResponse.json({ boardToken });
}
