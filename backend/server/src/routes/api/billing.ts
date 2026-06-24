import type { FastifyInstance } from "fastify";
import { runNextRouteHandler } from "../../lib/run-next-handler.js";
import * as checkout from "../handlers/billing/checkout.js";
import * as portal from "../handlers/billing/portal.js";
import * as changePlan from "../handlers/billing/change-plan.js";
import * as cancel from "../handlers/billing/cancel.js";
import * as cancelDowngrade from "../handlers/billing/cancel-downgrade.js";
import * as undoCancel from "../handlers/billing/undo-cancel.js";
import * as pause from "../handlers/billing/pause.js";
import * as previewPlanChange from "../handlers/billing/preview-plan-change.js";
import * as sync from "../handlers/billing/sync.js";

export async function registerBillingRoutes(app: FastifyInstance) {
  app.post("/billing/checkout", async (req, reply) => {
    await runNextRouteHandler(req, reply, checkout.POST);
  });
  app.post("/billing/portal", async (req, reply) => {
    await runNextRouteHandler(req, reply, portal.POST);
  });
  app.get("/billing/portal", async (req, reply) => {
    await runNextRouteHandler(req, reply, portal.GET);
  });
  app.post("/billing/change-plan", async (req, reply) => {
    await runNextRouteHandler(req, reply, changePlan.POST);
  });
  app.post("/billing/cancel", async (req, reply) => {
    await runNextRouteHandler(req, reply, cancel.POST);
  });
  app.post("/billing/cancel-downgrade", async (req, reply) => {
    await runNextRouteHandler(req, reply, cancelDowngrade.POST);
  });
  app.post("/billing/undo-cancel", async (req, reply) => {
    await runNextRouteHandler(req, reply, undoCancel.POST);
  });
  app.post("/billing/pause", async (req, reply) => {
    await runNextRouteHandler(req, reply, pause.POST);
  });
  app.post("/billing/preview-plan-change", async (req, reply) => {
    await runNextRouteHandler(req, reply, previewPlanChange.POST);
  });
  app.post("/billing/sync", async (req, reply) => {
    await runNextRouteHandler(req, reply, sync.POST);
  });
}
