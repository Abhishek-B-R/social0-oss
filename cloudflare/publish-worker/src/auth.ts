import type { PublishJobEnvelope } from "./types";

export const ORCHESTRATOR_QUEUE = "social0-publish-orchestrator";
export const PLATFORM_QUEUE = "social0-publish-platform";

export function verifyBearerAuth(
  request: Request,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${secret}`;
}

export function parsePublishEnvelope(body: unknown): PublishJobEnvelope | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.kind !== "orchestrator" && o.kind !== "platform") return null;
  if (!o.job || typeof o.job !== "object") return null;
  const job = o.job as Record<string, unknown>;
  if (typeof job.postId !== "string" || typeof job.userId !== "string") {
    return null;
  }
  if (o.kind === "platform") {
    if (
      typeof job.publicationId !== "string" ||
      typeof job.connectedAccountId !== "string" ||
      typeof job.platform !== "string"
    ) {
      return null;
    }
  }
  return body as PublishJobEnvelope;
}

export function queueKindForBatch(queueName: string): "orchestrator" | "platform" | null {
  if (queueName === ORCHESTRATOR_QUEUE) return "orchestrator";
  if (queueName === PLATFORM_QUEUE) return "platform";
  return null;
}
