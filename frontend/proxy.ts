import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import {
  edgeAuthIpLimiter,
  edgeAuthSessionPollLimiter,
  edgePageIpLimiter,
  enforceEdgeRateLimit,
} from "@/lib/edge-ratelimit";
import {
  isAuthSessionPoll,
  isFullPageDocumentRequest,
} from "@/lib/proxy-request";

function rateLimitedResponse(kind: "page" | "api"): NextResponse {
  const body =
    kind === "api"
      ? JSON.stringify({ error: "Too many requests. Try again later." })
      : "Too many requests. Try again later.";
  return new NextResponse(body, {
    status: 429,
    headers: {
      "Content-Type":
        kind === "api" ? "application/json" : "text/plain; charset=utf-8",
      "Retry-After": "60",
    },
  });
}

// Proxy runs at the network boundary (Next.js 16+)
// Auth is enforced in layout and API routes. Subscription gate removed for now.
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const ip = clientIp(req);

  if (path.startsWith("/api/auth")) {
    const limiter = isAuthSessionPoll(req)
      ? edgeAuthSessionPollLimiter
      : edgeAuthIpLimiter;
    const rate = await enforceEdgeRateLimit(limiter, `auth:${ip}`);
    if (!rate.allowed) return rateLimitedResponse("api");
    return NextResponse.next();
  }

  const isPage =
    path === "/" || path.startsWith("/dashboard") || path.startsWith("/auth");

  if (isPage && isFullPageDocumentRequest(req)) {
    const rate = await enforceEdgeRateLimit(edgePageIpLimiter, `page:${ip}`);
    if (!rate.allowed) return rateLimitedResponse("page");
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", path);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/",
    "/auth",
    "/auth/:path*",
    "/dashboard/:path*",
    "/api/connect/:path*",
    "/api/accounts",
    "/api/auth/:path*",
  ],
};
