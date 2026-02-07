import { NextRequest, NextResponse } from "next/server";

// Middleware runs in Edge runtime - we can't use Node.js modules here
// For now, we'll do basic path protection and let API routes handle auth checks
export default async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Allow API auth routes to pass through (Better Auth handles these)
  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // For other routes, we'll let them through and handle auth in the components/API routes
  // This avoids Edge runtime issues with crypto/database imports
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/api/connect/:path*", "/api/accounts"],
};

// Note: Auth protection is handled in:
// - app/dashboard/layout.tsx (server component - checks session)
// - app/api/connect/*/route.ts (API routes - check session)
// - app/api/accounts/route.ts (API routes - check session)
