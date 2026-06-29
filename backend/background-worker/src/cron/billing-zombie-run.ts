import { RouteResponse } from "../lib/route-response.js";
import { verifyCronAuth } from "../lib/cron-auth.js";
import { sweepStaleZombieSubscriptions } from "../lib/billing-zombie-cleanup.js";

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const forceParam = url.searchParams.get("force");
  const force = forceParam === "1" || forceParam === "true";

  const result = await sweepStaleZombieSubscriptions({ force });
  return RouteResponse.json(result);
}
