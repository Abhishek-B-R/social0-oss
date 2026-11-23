/** Page size for /dashboard/posts list (must match server query). */
export const POSTS_PAGE_SIZE = 18;

/**
 * `post_publications.last_error` written when a delivery was left in
 * `publishing` by a run that stopped (deploy, crash, killed isolate) before the
 * platform answered. The platform may or may not have created the post, so
 * nothing retries it on its own: only an explicit per-delivery Retry from a
 * person (dashboard) takes it over. Compared by equality, so keep it constant.
 */
export const INTERRUPTED_PUBLISH_ERROR =
  "Publishing was interrupted before the platform confirmed. The post may already be live: check the account before you retry.";
