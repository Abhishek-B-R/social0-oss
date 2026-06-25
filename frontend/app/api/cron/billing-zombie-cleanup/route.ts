import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sweepStaleZombieSubscriptions } from "@/lib/billing-zombie-cleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily sweep: cancel on_hold/pending/failed Dodo subs past grace period. */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await sweepStaleZombieSubscriptions();
  return NextResponse.json(result);
}
