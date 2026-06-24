import type { FastifyRequest } from "fastify";
import type { QueuedResponse } from "@social0/shared";
import { getSessionFromRequest } from "../lib/session.js";

export async function requireUserId(
  request: FastifyRequest,
): Promise<string | null> {
  const session = await getSessionFromRequest(request);
  if (session?.user?.id) return session.user.id;

  const header = request.headers["x-user-id"];
  if (typeof header === "string" && header.length > 0) return header;
  return null;
}

export function unauthorized() {
  return { error: "Unauthorized", code: "UNAUTHORIZED" };
}

export function accepted(jobId: string, queue: string): QueuedResponse {
  return { jobId, status: "queued", queue };
}

export function notImplemented(route: string) {
  return {
    error: "Not implemented — wire DB/services from frontend",
    route,
    code: "NOT_IMPLEMENTED",
  };
}
