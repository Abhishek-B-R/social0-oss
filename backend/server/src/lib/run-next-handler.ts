import type { FastifyReply, FastifyRequest } from "fastify";
import { NextRequest } from "./shim/next-server.js";
import {
  runWithRequestContext,
  type RequestContext,
} from "./request-context.js";
import { rethrowNextRedirect } from "./redirect.js";

type RouteContext = {
  params: Promise<Record<string, string>>;
};

export type NextRouteHandler = (
  req: NextRequest,
  ctx: RouteContext,
) => Promise<unknown>;

function buildRequestUrl(req: FastifyRequest): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const host = req.headers.host ?? "localhost";
  return `${proto}://${host}${req.url}`;
}

function buildNextRequest(req: FastifyRequest): NextRequest {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, String(value));
    }
  }

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.rawBody !== undefined) {
      init.body = req.rawBody;
    } else if (req.body !== undefined) {
      init.body = JSON.stringify(req.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }

  return new NextRequest(buildRequestUrl(req), init);
}

function finalizeNextResponse(result: unknown) {
  if (
    result &&
    typeof result === "object" &&
    "finalize" in result &&
    typeof (result as { finalize: () => void }).finalize === "function"
  ) {
    (result as { finalize: () => void }).finalize();
  }
}

export async function runNextRouteHandler(
  req: FastifyRequest,
  reply: FastifyReply,
  handler: NextRouteHandler,
  params: Record<string, string> = {},
): Promise<void> {
  const ctx: RequestContext = { req, reply };
  await runWithRequestContext(ctx, async () => {
    const nextReq = buildNextRequest(req);
    try {
      const result = await handler(nextReq, {
        params: Promise.resolve(params),
      });
      finalizeNextResponse(result);
    } catch (err) {
      rethrowNextRedirect(err);
      if (!reply.sent) throw err;
    }
  });
}
