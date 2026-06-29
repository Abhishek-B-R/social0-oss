import { auth } from "../../../lib/auth.js";
import { env } from "../../../lib/env.js";
import { headers } from "../../../lib/shim/request-cookies.js";
import { RouteResponse } from "../../../lib/shim/http.js";
import jwt from "jsonwebtoken";
import { oauthLimiter, enforceRateLimit } from "../../../lib/ratelimit.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(oauthLimiter, session.user.id);
  if (!rate.allowed) {
    return RouteResponse.json({ error: rate.error }, { status: rate.status });
  }

  const payload = {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
  };

  const privateKey = env.CANNY_PRIVATE_KEY;
  if (!privateKey) {
    return RouteResponse.json(
      { error: "Canny SSO not configured" },
      { status: 503 },
    );
  }

  const token = jwt.sign(payload, privateKey, {
    algorithm: "HS256",
    expiresIn: "1h",
  });

  return RouteResponse.json({ token });
}
