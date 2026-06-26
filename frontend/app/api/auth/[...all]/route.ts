import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { isBlockedNativeSignUpPath } from "@/lib/block-native-sign-up";

const handler = toNextJsHandler(auth);

function blockedResponse() {
  return NextResponse.json(
    { error: "Use the Turnstile-protected sign-up endpoint." },
    { status: 403 },
  );
}

export async function GET(req: NextRequest) {
  if (isBlockedNativeSignUpPath(req.nextUrl.pathname)) {
    return blockedResponse();
  }
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  if (isBlockedNativeSignUpPath(req.nextUrl.pathname)) {
    return blockedResponse();
  }
  return handler.POST(req);
}
