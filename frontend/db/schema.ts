import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
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
  "devto",
  "hashnode",
  "medium",
]);

export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "scheduled",
  "publishing",
  "published",
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
  email: text("email").notNull(),
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
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    platformMetadata: jsonb("platform_metadata").$type<Record<string, unknown>>(), // e.g. { publicationId } for Hashnode
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
    connectedAccountId: uuid("connected_account_id")
      .references(() => connectedAccounts.id)
      .notNull(),
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

// ===== USER SETTINGS =====
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .references(() => user.id)
    .primaryKey(),
  timezone: text("timezone").default("UTC"),
  defaultPlatforms: platformEnum("default_platforms").array(),
  emailNotifications: boolean("email_notifications").default(true),
  subscriptionTier: text("subscription_tier").default("free"), // free, pro
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
});

// ===== PLATFORM RATE LIMITS (optional) =====
export const platformRateLimits = pgTable("platform_rate_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectedAccountId: uuid("connected_account_id")
    .references(() => connectedAccounts.id)
    .notNull(),
  requestCount: integer("request_count").default(0),
  windowStart: timestamp("window_start").notNull(),
  windowEnd: timestamp("window_end").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ===== RELATIONS =====

export const userRelations = relations(user, ({ one, many }) => ({
  connectedAccounts: many(connectedAccounts),
  posts: many(posts),
  mediaUploads: many(mediaUploads),
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
  }),
);

export const postsRelations = relations(posts, ({ one, many }) => ({
  user: one(user, {
    fields: [posts.userId],
    references: [user.id],
  }),
  publications: many(postPublications),
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
