import { auth } from "../../lib/auth.js";
import { getLegalStatus, recordLegalAcceptances } from "../../lib/legal.js";
import { clientIp } from "../../lib/client-ip.js";
import { headers } from "../../lib/shim/request-cookies.js";
import { RouteResponse } from "../../lib/shim/http.js";

export async function acceptLegal(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { acceptTerms, acceptPrivacy, marketingOptIn } = body as {
    acceptTerms?: boolean;
    acceptPrivacy?: boolean;
    marketingOptIn?: boolean;
  };

  if (!acceptTerms || !acceptPrivacy) {
    return RouteResponse.json(
      {
        error:
          "You must accept the Terms of Service and acknowledge the Privacy Policy.",
        code: "LEGAL_CONSENT_REQUIRED",
      },
      { status: 400 },
    );
  }

  try {
    await recordLegalAcceptances({
      userId: session.user.id,
      acceptTerms: true,
      acceptPrivacy: true,
      marketingOptIn: !!marketingOptIn,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });
  } catch {
    return RouteResponse.json(
      { error: "Could not record legal acceptance.", code: "LEGAL_CONSENT_REQUIRED" },
      { status: 400 },
    );
  }

  const status = await getLegalStatus(session.user.id);
  return RouteResponse.json(status);
}
