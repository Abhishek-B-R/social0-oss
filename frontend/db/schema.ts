import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  pgEnum,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ===== ENUMS =====

export const platformEnum = pgEnum("platform", [
  "linkedin",
  "instagram",
  "youtube",
  "pinterest",
  "tiktok",
  "twitter_x",
  "threads",
  "bluesky",
  "facebook",
]);

export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "partial",
  "failed",
]);

export const publicationStatusEnum = pgEnum("publication_status", [
  "pending",
  "publishing",
  "published",
  "failed",
]);

// ===== BETTER AUTH TABLES =====
// Better Auth creates and owns these tables.
// We reference them here for foreign key relationships and to pass to Better Auth adapter.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified"),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// Session table (Better Auth)
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" })
    .notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// Account table (Better Auth - for OAuth providers)
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => ({
    uniqueProviderAccount: unique().on(table.providerId, table.accountId),
  })
);

// Verification table (Better Auth - for email verification, password reset, etc.)
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// ===== CONNECTED ACCOUNTS =====
export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .references(() => user.id)
      .notNull(),
    platform: platformEnum("platform").notNull(),
    platformUserId: text("platform_user_id").notNull(),
    platformUsername: text("platform_username"),
    profileImageUrl: text("profile_image_url"),
    scopes: text("scopes"), // OAuth scopes granted
    isActive: boolean("is_active").default(true),
    lastSyncedAt: timestamp("last_synced_at"),
    tokenStatus: text("token_status").default("active"), // active | expired | unknown
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    platformMetadata: jsonb("platform_metadata").$type<Record<string, unknown>>(),
    isTwitterPremium: boolean("is_twitter_premium").default(false),
    platformAccountType: text("platform_account_type").default("personal"), // 'personal' | 'company' (e.g. LinkedIn company pages)
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    uniqueAccount: unique().on(
      table.userId,
      table.platform,
      table.platformUserId,
    ),
  }),
);

// ===== MEDIA UPLOADS =====
export const mediaUploads = pgTable("media_uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .references(() => user.id)
    .notNull(),
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(), // e.g. image/jpeg, video/mp4
  sizeBytes: integer("size_bytes").notNull(),
  fileHash: text("file_hash"), // SHA-256 for deduplication
  url: text("url"), // S3/origin URL
  processedUrl: text("processed_url"), // Compressed/optimized version
  thumbnailUrl: text("thumbnail_url"), // For videos
  cdnUrl: text("cdn_url"), // CloudFront/R2 CDN URL
  status: text("status").notNull().default("uploaded"), // uploaded | compressing | transcoding | ready | failed
  expiresAt: timestamp("expires_at"), // Delete after N days if unused
  isAttachedToPost: boolean("is_attached_to_post").default(false),
  lastAccessedAt: timestamp("last_accessed_at"),
  uploadIp: text("upload_ip"), // Optional: for abuse detection
  userAgent: text("user_agent"), // Optional: for abuse detection
  createdAt: timestamp("created_at").defaultNow(),
});

// ===== POSTS =====
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .references(() => user.id)
      .notNull(),
    originalContent: text("original_content").notNull(), // User's raw input
    finalContent: text("final_content").notNull(), // What gets posted (can be AI-edited)
    isAiEnhanced: boolean("is_ai_enhanced").default(false),
    aiPrompt: text("ai_prompt"),
    mediaIds: uuid("media_ids").array().default([]), // References media_uploads.id
    status: postStatusEnum("status").default("draft"),
    scheduledAt: timestamp("scheduled_at"),
    failureReason: text("failure_reason"), // When status is failed: e.g. payment required, Twitter limit
    metadata: jsonb("metadata").$type<Record<string, unknown>>(), // Platform-specific settings (e.g. TikTok privacy, toggles)
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  () => ({
    // CHECK constraint: at least one of finalContent (non-empty) or mediaIds (non-empty)
    // This ensures posts have either text content or media (or both)
    contentOrMediaCheck: check(
      "content_or_media_check",
      sql`(trim(final_content) != '' OR array_length(media_ids, 1) > 0)`,
    ),
  }),
);

// ===== POST PUBLICATIONS =====
export const postPublications = pgTable(
  "post_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .references(() => posts.id)
      .notNull(),
    connectedAccountId: uuid("connected_account_id").references(
      () => connectedAccounts.id,
      { onDelete: "set null" },
    ),
    status: publicationStatusEnum("status").default("pending"),
    publishedAt: timestamp("published_at"),
    platformPostId: text("platform_post_id"), // e.g. LinkedIn post ID
    platformPostUrl: text("platform_post_url"), // Link to post on platform
    retryCount: integer("retry_count").default(0),
    maxRetries: integer("max_retries").default(3),
    nextRetryAt: timestamp("next_retry_at"),
    lastError: text("last_error"),
    errorHistory:
      jsonb("error_history").$type<
        Array<{ timestamp: string; error: string; retryCount: number }>
      >(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    uniquePublication: unique().on(table.postId, table.connectedAccountId),
  }),
);

// ===== QUEUE SLOTS (recurring weekly schedule) =====
export const queueSlots = pgTable(
  "queue_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    daysOfWeek: integer("days_of_week").array().notNull(), // 0=Sun, 1=Mon ... 6=Sat; e.g. [1,2,3,4,5] = Mon–Fri
    hour: integer("hour").notNull(), // 0-23, in user's local timezone
    minute: integer("minute").notNull(), // 0-59
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userHourMinuteUnique: unique().on(table.userId, table.hour, table.minute),
  }),
);

// ===== QUEUED POSTS (posts waiting in queue) =====
export const queuedPosts = pgTable("queued_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" })
    .notNull(),
  postId: uuid("post_id")
    .references(() => posts.id, { onDelete: "cascade" })
    .notNull(),
  slotId: uuid("slot_id").references(() => queueSlots.id, { onDelete: "set null" }),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: text("status").default("pending").notNull(), // pending | processing | done | failed
  createdAt: timestamp("created_at").defaultNow(),
});

// ===== USER SETTINGS =====
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .references(() => user.id)
    .primaryKey(),
  timezone: text("timezone").default("UTC"),
  defaultPlatforms: platformEnum("default_platforms").array(),
  emailNotifications: boolean("email_notifications").default(true),
  automationEmails: boolean("automation_emails").default(true),
  emailOnPostFailed: boolean("email_on_post_failed").default(true),
  useFilenameAsCaption: boolean("use_filename_as_caption").default(false),
  use24HourTimeFormat: boolean("use_24_hour_time_format").default(false),
  dateFormat: text("date_format").default("dd/MM/yyyy"), // dd/MM/yyyy | MM/dd/yyyy | yyyy-MM-dd
  weeklyPostingGoal: integer("weekly_posting_goal").default(3),
  subscriptionTier: text("subscription_tier").default("free"), // free | starter | growth | pro
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  subscriptionId: text("subscription_id"), // Payment provider subscription ID (portal/cancel)
  customerId: text("customer_id"), // Payment provider customer ID
  hasUsedTrial: boolean("has_used_trial").default(false), // true once user has ever had a paid plan (trial or paid); used for messaging when limit is 0
  onboardingCompleted: boolean("onboarding_completed").default(false),
  onboardingGoal: text("onboarding_goal"),
  /** Scheduled downgrade: target tier at period end (starter | growth). Cleared when cancelled or after switch. */
  pendingPlanTier: text("pending_plan_tier"),
  /** Downgrade feedback (captured before scheduling downgrade). */
  downgradeReason: text("downgrade_reason"),
  /** True when user cancelled; access until subscription_expires_at. Cleared when sub ends or user undoes cancel. */
  subscriptionCancelAtPeriodEnd: boolean("subscription_cancel_at_period_end").default(false),
  /** Lifetime posts used on the free tier (no reset). */
  freePostsUsed: integer("free_posts_used").default(0).notNull(),
});

// ===== SUBSCRIPTION CANCELLATION FEEDBACK =====
export const subscriptionCancellations = pgTable("subscription_cancellations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" })
    .notNull(),
  subscriptionId: text("subscription_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== PLATFORM RATE LIMITS (optional) =====
export const platformRateLimits = pgTable("platform_rate_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectedAccountId: uuid("connected_account_id")
    .references(() => connectedAccounts.id, { onDelete: "cascade" })
    .notNull(),
  requestCount: integer("request_count").default(0),
  windowStart: timestamp("window_start").notNull(),
  windowEnd: timestamp("window_end").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ===== RESURFACE (X / Twitter) =====
export const resurfaceSchedules = pgTable("resurface_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id")
    .references(() => posts.id, { onDelete: "cascade" })
    .notNull(),
  platform: text("platform").notNull(), // "x" for now
  intervalHours: real("interval_hours").notNull(),
  maxResurfaces: integer("max_resurfaces").notNull(),
  plugComment: text("plug_comment"),
  isActive: boolean("is_active").default(true).notNull(),
  resurfacesDone: integer("resurfaces_done").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const resurfaceEvents = pgTable("resurface_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  scheduleId: uuid("schedule_id")
    .references(() => resurfaceSchedules.id, { onDelete: "cascade" })
    .notNull(),
  platformReshareId: text("platform_reshare_id"),
  plugCommentId: text("plug_comment_id"),
  executedAt: timestamp("executed_at"),
  nextExecuteAt: timestamp("next_execute_at"),
  status: text("status").notNull(), // "pending" | "done" | "failed"
  createdAt: timestamp("created_at").defaultNow(),
});

// ===== AUTO-PLUG (X milestone-based reply) =====
export const autoPlugs = pgTable("auto_plugs", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id")
    .references(() => posts.id, { onDelete: "cascade" })
    .notNull(),
  connectedAccountId: uuid("connected_account_id")
    .references(() => connectedAccounts.id, { onDelete: "cascade" })
    .notNull(),
  platform: text("platform").default("x").notNull(),
  metricType: text("metric_type").notNull(), // "likes" | "retweets"
  metricThreshold: integer("metric_threshold").notNull(),
  plugComment: text("plug_comment").notNull(),
  status: text("status").notNull(), // "watching" | "triggered" | "expired" | "failed"
  platformPostId: text("platform_post_id").notNull(),
  plugTweetId: text("plug_tweet_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ===== RELATIONS =====

export const userRelations = relations(user, ({ one, many }) => ({
  connectedAccounts: many(connectedAccounts),
  posts: many(posts),
  mediaUploads: many(mediaUploads),
  queueSlots: many(queueSlots),
  queuedPosts: many(queuedPosts),
  settings: one(userSettings, {
    fields: [user.id],
    references: [userSettings.userId],
  }),
}));

export const connectedAccountsRelations = relations(
  connectedAccounts,
  ({ one, many }) => ({
    user: one(user, {
      fields: [connectedAccounts.userId],
      references: [user.id],
    }),
    publications: many(postPublications),
    rateLimits: many(platformRateLimits),
    autoPlugs: many(autoPlugs),
  }),
);

export const resurfaceSchedulesRelations = relations(
  resurfaceSchedules,
  ({ one, many }) => ({
    post: one(posts, {
      fields: [resurfaceSchedules.postId],
      references: [posts.id],
    }),
    events: many(resurfaceEvents),
  }),
);

export const resurfaceEventsRelations = relations(
  resurfaceEvents,
  ({ one }) => ({
    schedule: one(resurfaceSchedules, {
      fields: [resurfaceEvents.scheduleId],
      references: [resurfaceSchedules.id],
    }),
  }),
);

export const autoPlugsRelations = relations(autoPlugs, ({ one }) => ({
  post: one(posts, {
    fields: [autoPlugs.postId],
    references: [posts.id],
  }),
  connectedAccount: one(connectedAccounts, {
    fields: [autoPlugs.connectedAccountId],
    references: [connectedAccounts.id],
  }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  user: one(user, {
    fields: [posts.userId],
    references: [user.id],
  }),
  publications: many(postPublications),
  resurfaceSchedules: many(resurfaceSchedules),
  autoPlugs: many(autoPlugs),
  queuedPost: one(queuedPosts),
}));

export const postPublicationsRelations = relations(
  postPublications,
  ({ one }) => ({
    post: one(posts, {
      fields: [postPublications.postId],
      references: [posts.id],
    }),
    connectedAccount: one(connectedAccounts, {
      fields: [postPublications.connectedAccountId],
      references: [connectedAccounts.id],
    }),
  }),
);

export const mediaUploadsRelations = relations(mediaUploads, ({ one }) => ({
  user: one(user, {
    fields: [mediaUploads.userId],
    references: [user.id],
  }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(user, {
    fields: [userSettings.userId],
    references: [user.id],
  }),
}));

export const platformRateLimitsRelations = relations(
  platformRateLimits,
  ({ one }) => ({
    connectedAccount: one(connectedAccounts, {
      fields: [platformRateLimits.connectedAccountId],
      references: [connectedAccounts.id],
    }),
  }),
);

export const queueSlotsRelations = relations(queueSlots, ({ one }) => ({
  user: one(user, {
    fields: [queueSlots.userId],
    references: [user.id],
  }),
}));

export const queuedPostsRelations = relations(queuedPosts, ({ one }) => ({
  user: one(user, {
    fields: [queuedPosts.userId],
    references: [user.id],
  }),
  post: one(posts, {
    fields: [queuedPosts.postId],
    references: [posts.id],
  }),
  slot: one(queueSlots, {
    fields: [queuedPosts.slotId],
    references: [queueSlots.id],
  }),
}));
