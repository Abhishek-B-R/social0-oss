import type { FastifyInstance } from "fastify";
import {
  accepted,
  notImplemented,
  requireUserId,
  unauthorized,
} from "../../middleware/auth.js";
import {
  enqueueBillingSync,
  queueNameForJob,
} from "../../services/enqueue.js";
import { JOB_NAMES } from "@social0/shared";

export async function registerBillingRoutes(app: FastifyInstance) {
  app.post("/billing/checkout", async () =>
    notImplemented("POST /api/billing/checkout"),
  );
  app.post("/billing/portal", async () =>
    notImplemented("POST /api/billing/portal"),
  );
  app.post("/billing/change-plan", async () =>
    notImplemented("POST /api/billing/change-plan"),
  );
  app.post("/billing/cancel", async () =>
    notImplemented("POST /api/billing/cancel"),
  );
  app.post("/billing/cancel-downgrade", async () =>
    notImplemented("POST /api/billing/cancel-downgrade"),
  );
  app.post("/billing/undo-cancel", async () =>
    notImplemented("POST /api/billing/undo-cancel"),
  );
  app.post("/billing/pause", async () =>
    notImplemented("POST /api/billing/pause"),
  );
  app.post("/billing/preview-plan-change", async () =>
    notImplemented("POST /api/billing/preview-plan-change"),
  );

  app.post("/billing/sync", async (request, reply) => {
    const userId = await requireUserId(request);
    if (!userId) return unauthorized();
    const job = await enqueueBillingSync(app, { userId });
    return reply
      .status(202)
      .send(accepted(job.id!, queueNameForJob(JOB_NAMES.BILLING_SYNC)));
  });
}
