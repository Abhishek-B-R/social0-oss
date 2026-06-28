import { proxyBackendCron } from "@/lib/proxy-backend-cron";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyBackendCron(request, "token-health");
}

export const POST = GET;
