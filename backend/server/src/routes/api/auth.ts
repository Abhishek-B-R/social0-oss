import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auth } from "../../lib/auth.js";
import { getAuthApiBaseUrl } from "../../lib/env.js";
import {
  isBlockedNativeSignUpPath,
  isBlockedOtpSignInRequest,
} from "../../lib/block-native-sign-up.js";
import {
  enforceAuthEmailRateLimit,
  recordAuthEmailOutcome,
} from "../../lib/auth-email-rate-limit.js";
import { runRouteHandler } from "../../lib/run-route-handler.js";
import { signUpDev, signUpWithTurnstile } from "./auth-sign-up.js";
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
      error: "Email sign-up must use POST /api/auth/sign-up.",
      code: "USE_SIGN_UP_ENDPOINT",
    });
  }

  if (isBlockedOtpSignInRequest(request.method, url.pathname, request.body)) {
    reply.status(403);
    return reply.send({
      error: "Sign-in by email code is not available.",
      code: "OTP_SIGN_IN_DISABLED",
    });
  }

  const emailRate = await enforceAuthEmailRateLimit(
    request.method,
    url.pathname,
    request.body,
    request.ip,
  );
  if (!emailRate.allowed) {
    reply.status(emailRate.status);
    if (emailRate.reset !== undefined) {
      const retryAfter = Math.max(
        1,
        Math.ceil((emailRate.reset - Date.now()) / 1000),
      );
      reply.header("x-retry-after", String(retryAfter));
    }
    return reply.send({
      code: "TOO_MANY_REQUESTS",
      message: emailRate.error,
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
  // Password sign-in is charged only when it fails (see auth-email-rate-limit).
  await recordAuthEmailOutcome(
    request.method,
    url.pathname,
    request.body,
    request.ip,
    response.status,
  );
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
    await runRouteHandler(req, reply, (request) => signUpDev(request));
  });

  // Name is a contract: this route always verifies the Turnstile token.
  app.post("/auth/sign-up-with-turnstile", async (req, reply) => {
    await runRouteHandler(req, reply, (request) =>
      signUpWithTurnstile(request),
    );
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
