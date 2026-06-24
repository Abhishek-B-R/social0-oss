import type { FastifyReply, FastifyRequest } from "fastify";
import { NextRequest } from "./shim/next-server.js";
import { buildForwardedRequestUrl } from "./forwarded-request-url.js";
import {
  runWithRequestContext,
  getRequestContext,
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

  return new NextRequest(buildForwardedRequestUrl(req), init);
}

async function finalizeHandlerResult(result: unknown) {
  if (result instanceof Response) {
    const { reply } = getRequestContext();
    await sendWebResponse(result, reply);
    return;
  }
  if (
    result &&
    typeof result === "object" &&
    "finalize" in result &&
    typeof (result as { finalize: () => void }).finalize === "function"
  ) {
    (result as { finalize: () => void }).finalize();
  }
}

async function sendWebResponse(result: Response, reply: FastifyReply) {
  if (reply.sent) return;
  reply.status(result.status);
  const setCookies = result.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      reply.header("set-cookie", cookie);
    }
  }
  result.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    reply.header(key, value);
  });
  const buf = Buffer.from(await result.arrayBuffer());
  if (buf.length > 0) reply.send(buf);
  else reply.send();
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
      await finalizeHandlerResult(result);
    } catch (err) {
      rethrowNextRedirect(err);
      if (!reply.sent) throw err;
    }
  });
}
