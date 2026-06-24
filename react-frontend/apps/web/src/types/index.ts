import type { Platform } from "@/lib/platforms";
import type { SubscriptionTier } from "@/lib/plans";

export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed";

export type PublicationStatus =
  | "pending"
  | "publishing"
  | "published"
  | "failed";

export interface ConnectedAccount {
  id: string;
  platform: Platform;
  platformUserId: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean;
  tokenStatus?: "ok" | "expiring_soon" | "expired";
  expiresInDays?: number | null;
  isTwitterPremium?: boolean | null;
}

export interface PostPublication {
  id: string;
  postId: string;
  connectedAccountId: string | null;
  status: PublicationStatus;
  publishedAt: string | null;
  platformPostId: string | null;
  platformPostUrl: string | null;
  lastError: string | null;
  platform?: Platform;
  platformUsername?: string | null;
}

export interface Post {
  id: string;
  userId: string;
  caption: string | null;
  status: PostStatus;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  mediaIds?: string[];
  publications?: PostPublication[];
}

export interface UserSettings {
  userId: string;
  timezone: string;
  emailNotifications: boolean;
  automationEmails: boolean;
  emailOnPostFailed: boolean;
  useFilenameAsCaption: boolean;
  use24HourTimeFormat: boolean;
  dateFormat: string;
  weeklyPostingGoal: number;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: string | null;
  onboardingCompleted: boolean;
  onboardingGoal: string | null;
}

export interface QueueSlot {
  id: string;
  userId: string;
  daysOfWeek: number[];
  hour: number;
  minute: number;
  isActive: boolean;
}

export type PublishMode = "now" | "schedule";

export interface PublishNowResponse {
  trackingId: string;
  jobId: string;
  status: "queued";
  queue: string;
  streamUrl: string;
}

export interface PublishScheduleResponse {
  status: "scheduled";
  postId: string;
  scheduledAt: string;
  jobId: string;
  message: string;
}

export type JobProgressPhase =
  | "queued"
  | "fan_out"
  | "platform_queued"
  | "platform_uploading"
  | "platform_success"
  | "platform_failed"
  | "completed"
  | "failed";

export interface JobProgressEvent {
  trackingId: string;
  postId: string;
  userId: string;
  phase: JobProgressPhase;
  platform?: Platform;
  connectedAccountId?: string;
  message?: string;
  progress?: { completed: number; failed: number; total: number };
  ts: string;
}

export interface JobSnapshot {
  trackingId: string;
  postId: string;
  userId: string;
  status: "queued" | "processing" | "completed" | "failed";
  events: JobProgressEvent[];
  progress: { completed: number; failed: number; total: number };
}

export interface ApiErrorBody {
  error?: string | Record<string, unknown>;
  code?: string;
  message?: string;
}
