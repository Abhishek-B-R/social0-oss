import { NextRequest, NextResponse } from "next/server";

// Proxy runs at the network boundary (Next.js 16+)
// Auth is enforced in layout and API routes. Subscription gate removed for now.
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Allow API auth routes to pass through (Better Auth handles these)
  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/api/connect/:path*", "/api/accounts"],
};
