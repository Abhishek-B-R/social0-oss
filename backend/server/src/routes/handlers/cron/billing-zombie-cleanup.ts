import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../../lib/cron-auth.js";
import { sweepStaleZombieSubscriptions } from "../../../lib/billing-zombie-cleanup.js";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await sweepStaleZombieSubscriptions();
  return NextResponse.json(result);
}
