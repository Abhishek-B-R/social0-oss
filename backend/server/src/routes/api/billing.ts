import type { FastifyInstance } from "fastify";
import { runRouteHandler } from "../../lib/run-route-handler.js";
import { createCheckout } from "../../handlers/billing/checkout.js";
import {
  getBillingPortal,
  openBillingPortal,
} from "../../handlers/billing/portal.js";
import { changePlan } from "../../handlers/billing/change-plan.js";
import { cancelSubscription } from "../../handlers/billing/cancel.js";
import { cancelDowngrade } from "../../handlers/billing/cancel-downgrade.js";
import { undoCancel } from "../../handlers/billing/undo-cancel.js";
import { pauseSubscription } from "../../handlers/billing/pause.js";
import { previewPlanChange } from "../../handlers/billing/preview-plan-change.js";
import { syncBilling } from "../../handlers/billing/sync.js";

export async function registerBillingRoutes(app: FastifyInstance) {
  app.post("/billing/checkout", async (req, reply) => {
    await runRouteHandler(req, reply, createCheckout);
  });
  app.post("/billing/portal", async (req, reply) => {
    await runRouteHandler(req, reply, openBillingPortal);
  });
  app.get("/billing/portal", async (req, reply) => {
    await runRouteHandler(req, reply, getBillingPortal);
  });
  app.post("/billing/change-plan", async (req, reply) => {
    await runRouteHandler(req, reply, changePlan);
  });
  app.post("/billing/cancel", async (req, reply) => {
    await runRouteHandler(req, reply, cancelSubscription);
  });
  app.post("/billing/cancel-downgrade", async (req, reply) => {
    await runRouteHandler(req, reply, cancelDowngrade);
  });
  app.post("/billing/undo-cancel", async (req, reply) => {
    await runRouteHandler(req, reply, undoCancel);
  });
  app.post("/billing/pause", async (req, reply) => {
    await runRouteHandler(req, reply, pauseSubscription);
  });
  app.post("/billing/preview-plan-change", async (req, reply) => {
    await runRouteHandler(req, reply, previewPlanChange);
  });
  app.post("/billing/sync", async (req, reply) => {
    await runRouteHandler(req, reply, syncBilling);
  });
}
