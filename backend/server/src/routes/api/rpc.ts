import type { FastifyInstance } from "fastify";
import { runWithRequestContext } from "../../lib/request-context.js";
import { rethrowNextRedirect } from "../../lib/redirect.js";
import { requireSessionUserId, unauthorized } from "../../middleware/auth.js";
import * as dashboardData from "../../bff/actions/dashboard-data.js";
import * as onboarding from "../../bff/actions/onboarding.js";
import * as posts from "../../bff/actions/posts.js";
import * as publish from "../../bff/actions/publish.js";
import * as resurface from "../../bff/actions/resurface.js";
import * as settings from "../../bff/actions/settings.js";

type RpcHandler = (...args: any[]) => Promise<unknown>;

const RPC_HANDLERS: Record<string, RpcHandler> = {
  "dashboard-data.loadDashboardLayoutData": dashboardData.loadDashboardLayoutData,
  "dashboard-data.checkBulkToolsGate": dashboardData.checkBulkToolsGate,
  "dashboard-data.loadComposerSettings": dashboardData.loadComposerSettings,
  "dashboard-data.loadPostsPageData": dashboardData.loadPostsPageData,
  "dashboard-data.loadConnectionsPageData": dashboardData.loadConnectionsPageData,
  "dashboard-data.loadBillingPageData": dashboardData.loadBillingPageData,
  "dashboard-data.loadCalendarPageData": dashboardData.loadCalendarPageData,
  "dashboard-data.loadPostDetailCoreData": dashboardData.loadPostDetailCoreData,
  "dashboard-data.loadPostDetailMediaData": dashboardData.loadPostDetailMediaData,
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
  "settings.loadSettingsPageData": settings.loadSettingsPageData,
  "settings.getUserSettingsSnapshot": settings.getUserSettingsSnapshot,
  "settings.updateDisplayName": settings.updateDisplayName,
  "settings.updateUserImage": settings.updateUserImage,
  "settings.updateConnectionAvatar": settings.updateConnectionAvatar,
  "settings.updateAutomationEmails": settings.updateAutomationEmails,
  "settings.updatePlatformPreferences": settings.updatePlatformPreferences,
  "settings.updateTimezone": settings.updateTimezone,
  "settings.signOutAllDevices": settings.signOutAllDevices,
};

function reviveArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (
      arg &&
      typeof arg === "object" &&
      !Array.isArray(arg) &&
      "__formData" in arg &&
      (arg as { __formData: unknown }).__formData === true
    ) {
      const entries = (arg as unknown as { entries: Record<string, string> })
        .entries;
      const formData = new FormData();
      for (const [key, value] of Object.entries(entries)) {
        formData.set(key, value);
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

    const body = request.body as { fn?: string; args?: unknown[] };
    const fn = body.fn;
    const args = Array.isArray(body.args) ? body.args : [];

    if (!fn || typeof fn !== "string") {
      return reply.status(400).send({ error: "Missing fn" });
    }

    const handler = RPC_HANDLERS[fn];
    if (!handler) {
      return reply.status(404).send({ error: `Unknown RPC: ${fn}` });
    }

    try {
      const result = await runWithRequestContext(
        { req: request, reply },
        async () => handler(...reviveArgs(args)),
      );
      if (!reply.sent) {
        return result ?? null;
      }
    } catch (err) {
      rethrowNextRedirect(err);
      if (!reply.sent) throw err;
    }
  });
}
