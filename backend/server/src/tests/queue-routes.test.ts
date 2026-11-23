import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

/**
 * POST /api/queue/add used to move any post (draft, published, publishing,
 * failed) to "scheduled" at the next slot without checking its status or
 * charging the free-post quota, so a Free user could schedule unlimited drafts.
 * Nothing called it (queue-mode posts are created by `posts.createPost`), so
 * the route is gone rather than hardened.
 */

vi.mock("../handlers/queue/slots.js", () => ({
  listQueueSlots: vi.fn(),
  createQueueSlot: vi.fn(),
}));
vi.mock("../handlers/queue/slots-id.js", () => ({
  updateQueueSlot: vi.fn(),
  deleteQueueSlot: vi.fn(),
}));
vi.mock("../handlers/queue/next-slot.js", () => ({
  getNextQueueSlot: vi.fn(),
}));

import { registerQueueRoutes } from "../routes/api/queue.js";

describe("queue routes", () => {
  it("does not register POST /queue/add", async () => {
    const app = Fastify();
    await app.register(registerQueueRoutes);
    await app.ready();

    expect(app.hasRoute({ method: "POST", url: "/queue/add" })).toBe(false);
    expect(app.hasRoute({ method: "GET", url: "/queue/next-slot" })).toBe(true);
    expect(app.hasRoute({ method: "POST", url: "/queue/slots" })).toBe(true);

    const res = await app.inject({
      method: "POST",
      url: "/queue/add",
      payload: { postId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
