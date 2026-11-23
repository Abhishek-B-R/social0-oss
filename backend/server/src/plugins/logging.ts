import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

async function loggingPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    // `request.id` already honours an inbound x-request-id (see `genReqId` in
    // app.ts) and falls back to a UUID, so it is the one id to echo and log.
    const requestId = request.id;
    reply.header("x-request-id", requestId);

    request.log = request.log.child({
      requestId,
      method: request.method,
      path: request.url,
    });
  });
  // No onResponse log here: Fastify's own "request completed" line already
  // carries reqId, status code and response time for every request.
}

/**
 * fp breaks encapsulation so the hook lands on the root instance and runs for
 * every route, not only routes declared inside this plugin (there are none).
 */
export const registerLoggingPlugin = fp(loggingPlugin, { name: "request-logging" });
