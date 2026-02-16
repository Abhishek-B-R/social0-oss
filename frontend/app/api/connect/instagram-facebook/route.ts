import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { encrypt } from "@/lib/encryption";
import { normalizeAppUrl } from "@/lib/url-utils";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get Facebook client ID and secret (same as Facebook OAuth)
  const clientId = env.FACEBOOK_CLIENT_ID;
  const clientSecret = env.FACEBOOK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.json(
      { error: "Facebook OAuth credentials not configured" },
      { status: 400 },
    );
  }

  // Construct redirect URI
  const baseUrl = normalizeAppUrl(env.NEXT_PUBLIC_APP_URL);
  const redirectUri = `${baseUrl}/api/connect/instagram-facebook/callback`;

  // Facebook OAuth URL for Instagram via Pages
  const authUrl = "https://www.facebook.com/v18.0/dialog/oauth";

  // Scopes: instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement
  const scope = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement";

  // Encrypt state with userId and platform identifier
  const state = encrypt({
    userId: session.user.id,
    platform: "instagram-facebook", // Special identifier for this flow
  });

  const url = new URL(authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);

  const finalUrl = url.toString();

  console.log("🔍 Instagram-Facebook OAuth URL:", finalUrl);

  return redirect(finalUrl);
}
