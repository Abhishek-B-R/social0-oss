import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sweepStaleZombieSubscriptions } from "@/lib/billing-zombie-cleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseForce(request: Request): boolean {
  const force = new URL(request.url).searchParams.get("force");
  return force === "1" || force === "true";
}

/** Daily sweep: cancel on_hold/pending/failed Dodo subs (past grace, or all with ?force=1). */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await sweepStaleZombieSubscriptions({
    force: parseForce(request),
  });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return GET(request);
}
