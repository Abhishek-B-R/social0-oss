import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

export async function registerLoggingPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    const requestId =
      (request.headers["x-request-id"] as string | undefined) ?? randomUUID();
    request.headers["x-request-id"] = requestId;
    reply.header("x-request-id", requestId);

    request.log = request.log.child({
      requestId,
      method: request.method,
      path: request.url,
    });
  });

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "request completed",
    );
  });
}
