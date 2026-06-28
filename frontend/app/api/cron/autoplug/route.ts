import { proxyBackendCron } from "@/lib/proxy-backend-cron";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyBackendCron(request, "autoplug");
}

export const POST = GET;
