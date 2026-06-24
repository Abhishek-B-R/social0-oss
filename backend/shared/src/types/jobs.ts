import type { SupportedPlatform } from "../constants/platforms.js";

/** Orchestrator job: publish one post to all selected accounts. */
export type PublishPostJob = {
  postId: string;
  userId: string;
  /** SSE tracking id — publish-now only; omitted for scheduled jobs. */
  trackingId?: string;
  /** If omitted, engine loads targets from DB. */
  connectedAccountIds?: string[];
};

/** Per-platform worker job (1–2.5 min typical). */
export type PublishPlatformJob = {
  postId: string;
  userId: string;
  /** SSE tracking — publish-now only. */
  trackingId?: string;
  publicationId: string;
  connectedAccountId: string;
  platform: SupportedPlatform;
};

export type EmailPostFailedJob = {
  userId: string;
  postId: string;
  platform: SupportedPlatform;
  connectedAccountId: string;
  errorMessage: string;
};

export type TokenRefreshJob = {
  userId: string;
  connectedAccountId: string;
  platform: SupportedPlatform;
};

export type MediaConfirmJob = {
  userId: string;
  mediaId: string;
};

export type BillingSyncJob = {
  userId: string;
};

export type JobPayload =
  | PublishPostJob
  | PublishPlatformJob
  | EmailPostFailedJob
  | TokenRefreshJob
  | MediaConfirmJob
  | BillingSyncJob;

export type QueuedResponse = {
  jobId: string;
  status: "queued";
  queue: string;
};
