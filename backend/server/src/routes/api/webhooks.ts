import type { FastifyInstance, FastifyRequest } from "fastify";
import { Readable } from "node:stream";
import { runNextRouteHandler } from "../../lib/run-next-handler.js";
import * as dodo from "../handlers/webhooks/dodo.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

async function captureRawBody(
  request: FastifyRequest,
  _reply: unknown,
  payload: Readable,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buf = Buffer.concat(chunks);
  request.rawBody = buf.toString("utf8");
  return Readable.from([buf]);
}

export async function registerWebhooksRoutes(app: FastifyInstance) {
  app.post(
    "/webhooks/dodo",
    { preParsing: captureRawBody },
    async (req, reply) => {
      await runNextRouteHandler(req, reply, dodo.POST);
    },
  );
}
