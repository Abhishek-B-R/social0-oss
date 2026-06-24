import type { TokenRefreshJob } from "@social0/shared";
import { getValidToken } from "../lib/token-refresh.js";

export async function refreshPlatformToken(
  job: TokenRefreshJob,
): Promise<void> {
  await getValidToken(job.connectedAccountId, job.platform);
}
