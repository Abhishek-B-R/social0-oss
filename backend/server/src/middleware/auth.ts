import type { FastifyRequest } from "fastify";
import type { QueuedResponse } from "@social0/shared";
import { getSessionFromRequest } from "../lib/session.js";
import { resolveUserIdFromApiKey } from "../lib/api-keys.js";

export async function requireUserId(
  request: FastifyRequest,
): Promise<string | null> {
  const session = await getSessionFromRequest(request);
  if (session?.user?.id) return session.user.id;

  const apiUser = await resolveUserIdFromApiKey(
    request.headers.authorization as string | undefined,
  );
  if (apiUser) return apiUser;

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
