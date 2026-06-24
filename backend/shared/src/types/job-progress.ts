import type { SupportedPlatform } from "../constants/platforms.js";

export type JobProgressPhase =
  | "queued"
  | "fan_out"
  | "platform_queued"
  | "platform_uploading"
  | "platform_success"
  | "platform_failed"
  | "completed"
  | "failed";

export type JobProgressEvent = {
  trackingId: string;
  postId: string;
  userId: string;
  phase: JobProgressPhase;
  platform?: SupportedPlatform;
  connectedAccountId?: string;
  message?: string;
  progress?: {
    completed: number;
    failed: number;
    total: number;
  };
  ts: string;
};

export type JobProgressSnapshot = {
  trackingId: string;
  postId: string;
  userId: string;
  status: "queued" | "processing" | "completed" | "failed";
  total: number;
  completed: number;
  failed: number;
  events: JobProgressEvent[];
  updatedAt: string;
};

export type PublishNowResponse = {
  trackingId: string;
  jobId: string;
  status: "queued";
  queue: string;
  streamUrl: string;
};

export type ScheduledPublishResponse = {
  status: "scheduled";
  postId: string;
  scheduledAt: string;
  jobId: string;
  message: string;
};
