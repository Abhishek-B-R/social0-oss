import type { FastifyInstance } from "fastify";
import { registerPostsRoutes } from "./posts.js";
import { registerMediaRoutes } from "./media.js";
import { registerSocialAccountsRoutes } from "./social-accounts.js";
import { registerPostResultsRoutes } from "./post-results.js";

export async function registerV1Routes(app: FastifyInstance) {
  await app.register(registerPostsRoutes);
  await app.register(registerMediaRoutes);
  await app.register(registerSocialAccountsRoutes);
  await app.register(registerPostResultsRoutes);
}
