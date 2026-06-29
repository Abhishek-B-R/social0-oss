import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auth } from "../../lib/auth.js";
import { getAuthApiBaseUrl } from "../../lib/env.js";
import { isBlockedNativeSignUpPath } from "../../lib/block-native-sign-up.js";
import { runRouteHandler } from "../../lib/run-route-handler.js";
import { signUpDev } from "./auth-sign-up.js";
import { signUpWithTurnstile } from "./auth-sign-up-turnstile.js";
import { checkEmail } from "./auth-check-email.js";
import { subscriptionCheck } from "./auth-subscription-check.js";
import { testSignin } from "./auth-test-signin.js";

async function handleBetterAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const baseUrl = getAuthApiBaseUrl();
  const apiHost = new URL(baseUrl).host;
  const url = new URL(request.url, `${baseUrl}/`);

  if (isBlockedNativeSignUpPath(url.pathname)) {
    reply.status(403);
    return reply.send({
      error: "Use the Turnstile-protected sign-up endpoint.",
    });
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    // ponytail: SPA/proxy sends dev.social0.app — force OAuth redirect_uri to api host
    if (lower === "host" || lower === "x-forwarded-host") continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  headers.set("host", apiHost);
  headers.set("x-forwarded-host", apiHost);
  headers.set("x-forwarded-proto", new URL(baseUrl).protocol.replace(":", ""));

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = JSON.stringify(request.body ?? {});
    headers.set("content-type", "application/json");
  }

  const response = await auth.handler(new Request(url.toString(), init));
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > 0) reply.send(buf);
  else reply.send();
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/auth/check-email", async (req, reply) => {
    await runRouteHandler(req, reply, checkEmail);
  });

  app.post("/auth/sign-up", async (req, reply) => {
    await runRouteHandler(req, reply, signUpDev);
  });

  app.post("/auth/sign-up-with-turnstile", async (req, reply) => {
    await runRouteHandler(req, reply, signUpWithTurnstile);
  });

  app.get("/auth/subscription-check", async (req, reply) => {
    await runRouteHandler(req, reply, subscriptionCheck);
  });

  app.get("/auth/test-signin", async (req, reply) => {
    await runRouteHandler(req, reply, testSignin);
  });

  app.all("/auth/*", async (req, reply) => {
    await handleBetterAuth(req, reply);
  });
}
