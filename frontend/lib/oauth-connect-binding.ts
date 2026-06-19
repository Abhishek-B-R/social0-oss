import { cookies } from "next/headers";
import { decrypt, encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { normalizeAppUrl } from "@/lib/url-utils";

const COOKIE_NAME = "oauth_connect_binding";
const MAX_AGE_SEC = 600;

function cookieOptions() {
  const baseUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
  const isHttps = baseUrl.startsWith("https://");
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    maxAge: MAX_AGE_SEC,
    path: "/",
  };
}

/** Set when the user starts an OAuth connect flow (same browser must complete callback). */
export async function setOAuthConnectBinding(
  userId: string,
  platform: string,
): Promise<void> {
  const cookieStore = await cookies();
  const value = encrypt({ userId, platform });
  cookieStore.set(COOKIE_NAME, value, cookieOptions());
}

function readBindingCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${COOKIE_NAME}=`)) {
      return decodeURIComponent(trimmed.slice(COOKIE_NAME.length + 1));
    }
  }
  return null;
}

export function verifyOAuthConnectBinding(
  request: Request,
  expectedUserId: string,
  expectedPlatform: string,
): boolean {
  const raw = readBindingCookie(request);
  if (!raw) return false;
  try {
    const decrypted = decrypt(raw);
    return (
      decrypted.userId === expectedUserId &&
      decrypted.platform === expectedPlatform
    );
  } catch {
    return false;
  }
}

export async function clearOAuthConnectBinding(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
