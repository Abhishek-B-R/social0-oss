import { verifyCronAuth } from "@/lib/cron-auth";

function backendApiBase(): string {
  const raw = process.env.BACKEND_API_URL?.trim() || "https://api.social0.app";
  return raw.replace(/\/$/, "");
}

/** Vercel cron → backend enqueue (server returns 202, background-worker runs job). */
export async function proxyBackendCron(
  request: Request,
  cronPath: string,
): Promise<Response> {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = `${backendApiBase()}/api/cron/${cronPath}`;
  const res = await fetch(url, {
    method: request.method,
    headers: {
      Authorization: request.headers.get("authorization") ?? "",
    },
  });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
    },
  });
}
