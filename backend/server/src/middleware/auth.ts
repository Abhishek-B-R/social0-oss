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

export async function requireUserId(
  request: FastifyRequest,
): Promise<string | null> {
  const session = await getSessionFromRequest(request);
  if (session?.user?.id) return session.user.id;

  const apiUser = await resolveUserIdFromApiKey(
    request.headers.authorization as string | undefined,
  );
  if (apiUser) return apiUser;

  return devUserIdFromHeader(request);
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
