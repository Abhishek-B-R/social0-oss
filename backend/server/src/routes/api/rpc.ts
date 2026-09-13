import type { FastifyInstance } from "fastify";
import { runWithRequestContext } from "../../lib/request-context.js";
import { rethrowRouteRedirect } from "../../lib/redirect.js";
import { requireSessionUserId, unauthorized } from "../../middleware/auth.js";
import {
  enforceRateLimit,
  rpcLimiter,
  rpcLiveReadLimiter,
  rpcMutationLimiter,
} from "../../lib/ratelimit.js";
import * as dashboardData from "../../services/dashboard-data.js";
import * as onboarding from "../../services/onboarding.js";
import * as posts from "../../services/posts.js";
import * as publish from "../../services/publish.js";
import * as resurface from "../../services/resurface.js";
import * as settings from "../../services/settings.js";
import * as analytics from "../../services/analytics.js";
import * as inbox from "../../services/inbox.js";

type RpcHandler = (...args: never[]) => Promise<unknown>;

const RPC_MUTATION_HANDLERS = new Set([
  "posts.createPost",
  "posts.deletePost",
  "posts.postAgain",
  "posts.updatePost",
  "posts.updateScheduledPostAutoFeatures",
  "posts.deleteDraft",
  "posts.updateDraft",
  "posts.updateAndPublish",
  "publish.publishPost",
  "resurface.createAutoPlug",
  "resurface.createResurfaceSchedule",
  "resurface.disableResurfaceSchedule",
  "resurface.updateAutoPlug",
  "resurface.cancelAutoPlug",
  "resurface.updateResurfaceSchedule",
  "settings.updateDisplayName",
  "settings.updateUserImage",
  "settings.updateConnectionAvatar",
  "settings.updateAutomationEmails",
  "settings.updatePlatformPreferences",
  "settings.updateTimezone",
  "settings.signOutAllDevices",
  "settings.deleteAccount",
  "onboarding.setOnboardingGoal",
  "onboarding.setOnboardingCompleted",
  "inbox.replyToComment",
  "inbox.likeComment",
  "inbox.hideComment",
  "inbox.replyToDm",
]);

/** Live platform fan-outs — stricter per-user budget than general RPC. */
const RPC_LIVE_READ_HANDLERS = new Set([
  "inbox.listComments",
  "inbox.listDms",
  "inbox.getDmThread",
  "analytics.getOverview",
  "analytics.getPostAnalytics",
]);

/**
 * `Object.create(null)` matters: with a normal object literal, `fn` values like
 * `"constructor"` or `"toString"` resolve through Object.prototype and get
 * *called*, slipping past the "Unknown RPC" guard.
 */
const RPC_HANDLERS: Record<string, RpcHandler> = Object.assign(
  Object.create(null) as Record<string, RpcHandler>,
  {
    "dashboard-data.loadDashboardLayoutData": dashboardData.loadDashboardLayoutData,
    "dashboard-data.checkBulkToolsGate": dashboardData.checkBulkToolsGate,
    "dashboard-data.loadComposerSettings": dashboardData.loadComposerSettings,
    "dashboard-data.loadPostsPageData": dashboardData.loadPostsPageData,
    "dashboard-data.loadConnectionsPageData": dashboardData.loadConnectionsPageData,
    "dashboard-data.loadBillingPageData": dashboardData.loadBillingPageData,
    "dashboard-data.loadCalendarPageData": dashboardData.loadCalendarPageData,
    "dashboard-data.loadPostDetailCoreData": dashboardData.loadPostDetailCoreData,
    "dashboard-data.loadPostDetailMediaData": dashboardData.loadPostDetailMediaData,
    "dashboard-data.loadAdjacentPosts": dashboardData.loadAdjacentPosts,
    "onboarding.getOnboardingStatus": onboarding.getOnboardingStatus,
    "onboarding.setOnboardingGoal": onboarding.setOnboardingGoal,
    "onboarding.setOnboardingCompleted": onboarding.setOnboardingCompleted,
    "posts.createPost": posts.createPost,
    "posts.deletePost": posts.deletePost,
    "posts.postAgain": posts.postAgain,
    "posts.updatePost": posts.updatePost,
    "posts.updateScheduledPostAutoFeatures":
      posts.updateScheduledPostAutoFeatures,
    "posts.getDraft": posts.getDraft,
    "posts.getScheduledPost": posts.getScheduledPost,
    "posts.getPostToEdit": posts.getPostToEdit,
    "posts.deleteDraft": posts.deleteDraft,
    "posts.updateDraft": posts.updateDraft,
    "posts.updateAndPublish": posts.updateAndPublish,
    "posts.loadEditPostPageData": posts.loadEditPostPageData,
    "publish.getPostPublicationList": publish.getPostPublicationList,
    "publish.publishPost": publish.publishPost,
    "resurface.createAutoPlug": resurface.createAutoPlug,
    "resurface.createResurfaceSchedule": resurface.createResurfaceSchedule,
    "resurface.disableResurfaceSchedule": resurface.disableResurfaceSchedule,
    "resurface.updateAutoPlug": resurface.updateAutoPlug,
    "resurface.cancelAutoPlug": resurface.cancelAutoPlug,
    "resurface.updateResurfaceSchedule": resurface.updateResurfaceSchedule,
    "analytics.getOverview": analytics.getAnalyticsOverview,
    "analytics.getPostAnalytics": analytics.getPostAnalytics,
    "analytics.listAccounts": analytics.listAnalyticsAccounts,
    "inbox.listComments": inbox.listInboxComments,
    "inbox.replyToComment": inbox.replyToInboxComment,
    "inbox.likeComment": inbox.likeInboxComment,
    "inbox.hideComment": inbox.hideInboxComment,
    "inbox.listDms": inbox.listInboxDms,
    "inbox.listAccounts": inbox.listInboxAccounts,
    "inbox.getDmThread": inbox.getInboxDmThread,
    "inbox.replyToDm": inbox.replyToInboxDm,
    "settings.loadSettingsPageData": settings.loadSettingsPageData,
    "settings.getUserSettingsSnapshot": settings.getUserSettingsSnapshot,
    "settings.updateDisplayName": settings.updateDisplayName,
    "settings.updateUserImage": settings.updateUserImage,
    "settings.updateConnectionAvatar": settings.updateConnectionAvatar,
    "settings.updateAutomationEmails": settings.updateAutomationEmails,
    "settings.updatePlatformPreferences": settings.updatePlatformPreferences,
    "settings.updateTimezone": settings.updateTimezone,
    "settings.signOutAllDevices": settings.signOutAllDevices,
    "settings.deleteAccount": settings.deleteAccount,
  },
);

function reviveArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (
      arg &&
      typeof arg === "object" &&
      !Array.isArray(arg) &&
      "__date" in arg &&
      (arg as { __date: unknown }).__date === true &&
      typeof (arg as { value?: unknown }).value === "string"
    ) {
      return new Date((arg as unknown as { value: string }).value);
    }
    if (
      arg &&
      typeof arg === "object" &&
      !Array.isArray(arg) &&
      "__formData" in arg &&
      (arg as { __formData: unknown }).__formData === true
    ) {
      const entries = (arg as { entries?: unknown }).entries;
      const formData = new FormData();
      if (entries && typeof entries === "object" && !Array.isArray(entries)) {
        for (const [key, value] of Object.entries(entries)) {
          if (typeof value === "string") formData.set(key, value);
        }
      }
      return formData;
    }
    return arg;
  });
}

export async function registerRpcRoutes(app: FastifyInstance) {
  app.post("/rpc", async (request, reply) => {
    const userId = await requireSessionUserId(request);
    if (!userId) return reply.status(401).send(unauthorized());

    const body =
      request.body && typeof request.body === "object"
        ? (request.body as { fn?: unknown; args?: unknown })
        : {};
    const fn = body.fn;
    const args = Array.isArray(body.args) ? body.args : [];

    if (typeof fn !== "string" || !fn) {
      return reply.status(400).send({ error: "Missing fn" });
    }

    const handler = RPC_HANDLERS[fn];
    if (typeof handler !== "function") {
      return reply.status(404).send({ error: "Unknown RPC" });
    }

    const limiter = RPC_MUTATION_HANDLERS.has(fn)
      ? rpcMutationLimiter
      : RPC_LIVE_READ_HANDLERS.has(fn)
        ? rpcLiveReadLimiter
        : rpcLimiter;
    const rate = await enforceRateLimit(
      limiter,
      RPC_LIVE_READ_HANDLERS.has(fn) ? `rpc:live:${userId}` : `rpc:${userId}`,
    );
    if (!rate.allowed) {
      return reply.status(rate.status).send({ error: rate.error });
    }

    try {
      const result = await runWithRequestContext(
        { req: request, reply },
        async () =>
          (handler as (...args: unknown[]) => Promise<unknown>)(
            ...reviveArgs(args),
          ),
      );
      if (!reply.sent) {
        return result ?? null;
      }
    } catch (err) {
      rethrowRouteRedirect(err);
      if (!reply.sent) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        const message =
          err instanceof Error ? err.message : "Internal server error";
        if (statusCode && statusCode >= 400 && statusCode < 500) {
          return reply.status(statusCode).send({ error: message });
        }
        throw err;
      }
    }
  });
}
