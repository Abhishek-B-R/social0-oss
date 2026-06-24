import type { TokenRefreshJob } from "@social0/shared";

/** Port OAuth refresh logic from frontend connect routes. */
export async function refreshPlatformToken(
  job: TokenRefreshJob,
): Promise<void> {
  console.info(
    `[worker] token refresh platform=${job.platform} account=${job.connectedAccountId}`,
  );
}
