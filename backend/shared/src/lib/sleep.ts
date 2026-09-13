/** Resolve after `ms`. Used by the retry loops in publish, webhooks and token refresh. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
