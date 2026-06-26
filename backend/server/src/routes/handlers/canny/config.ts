import { NextResponse } from "next/server";
import { env } from "../../../lib/env.js";

export const dynamic = "force-dynamic";

/** Public Canny board token for embedded widget (same value as NEXT_PUBLIC_CANNY_BOARD_TOKEN). */
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
