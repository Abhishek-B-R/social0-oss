import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auth } from "../../lib/auth.js";
import { env } from "../../lib/env.js";
import { runNextRouteHandler } from "../../lib/run-next-handler.js";
import { POST as signUpDev } from "./auth-sign-up.js";
import { POST as signUpTurnstile } from "./auth-sign-up-turnstile.js";
import { GET as checkEmail } from "./auth-check-email.js";
import { GET as subscriptionCheck } from "./auth-subscription-check.js";
import { GET as testSignin } from "./auth-test-signin.js";

async function handleBetterAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const baseUrl = env.BETTER_AUTH_URL.replace(/\/$/, "");
  const url = new URL(request.url, `${baseUrl}/`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

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
    await runNextRouteHandler(req, reply, checkEmail);
  });

  app.post("/auth/sign-up", async (req, reply) => {
    await runNextRouteHandler(req, reply, signUpDev);
  });

  app.post("/auth/sign-up-with-turnstile", async (req, reply) => {
    await runNextRouteHandler(req, reply, signUpTurnstile);
  });

  app.get("/auth/subscription-check", async (req, reply) => {
    await runNextRouteHandler(req, reply, subscriptionCheck);
  });

  app.get("/auth/test-signin", async (req, reply) => {
    await runNextRouteHandler(req, reply, testSignin);
  });

  app.all("/auth/*", async (req, reply) => {
    await handleBetterAuth(req, reply);
  });
}
