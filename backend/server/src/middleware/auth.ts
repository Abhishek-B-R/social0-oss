import type { FastifyRequest } from "fastify";
import type { QueuedResponse } from "@social0/shared";
import { getSessionFromRequest } from "../lib/session.js";
import { resolveUserIdFromApiKey } from "../lib/api-keys.js";

function devUserIdFromHeader(request: FastifyRequest): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.ALLOW_DEV_USER_HEADER !== "true") return null;
  const ip = request.ip;
  if (ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
    return null;
  }
  const header = request.headers["x-user-id"];
  if (typeof header === "string" && header.length > 0) return header;
  return null;
}

/** How a request proved who it is. API keys are scoped to the personal pool. */
export type RequestActor = {
  userId: string;
  source: "session" | "apiKey" | "devHeader";
};

/**
 * Resolve the caller *and* how they authenticated.
 *
 * The source matters on `/api/*`: a session carries the user's active
 * workspace, while an API key is a personal-pool credential (the rule `/v1`
 * enforces). Handlers that scope by workspace must not silently hand a key the
 * team's connections.
 */
export async function resolveRequestActor(
  request: FastifyRequest,
): Promise<RequestActor | null> {
  const session = await getSessionFromRequest(request);
  if (session?.user?.id) {
    return { userId: session.user.id, source: "session" };
  }

  const apiUser = await resolveUserIdFromApiKey(
    request.headers.authorization as string | undefined,
  );
  if (apiUser) return { userId: apiUser, source: "apiKey" };

  const devUser = devUserIdFromHeader(request);
  return devUser ? { userId: devUser, source: "devHeader" } : null;
}

export async function requireUserId(
  request: FastifyRequest,
): Promise<string | null> {
  return (await resolveRequestActor(request))?.userId ?? null;
}

/** Session cookie auth only (RPC / BFF-style routes). */
export async function requireSessionUserId(
  request: FastifyRequest,
): Promise<string | null> {
  const session = await getSessionFromRequest(request);
  return session?.user?.id ?? null;
}

export function unauthorized() {
  return { error: "Unauthorized", code: "UNAUTHORIZED" };
}

export function accepted(jobId: string, queue: string): QueuedResponse {
  return { jobId, status: "queued", queue };
}

export function notImplemented(route: string) {
  return {
    error: "Not implemented - wire DB/services from frontend",
    route,
    code: "NOT_IMPLEMENTED",
  };
}
