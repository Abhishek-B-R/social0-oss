import { AppRequest, RouteResponse } from "../../lib/shim/http.js";
import {
  checkEmailLimiter,
  checkEmailPerEmailLimiter,
  enforceRateLimit,
} from "../../lib/ratelimit.js";
import { clientIp } from "../../lib/client-ip.js";

/**
 * Pre-sign-in email check. Does not reveal whether an account exists (enumeration-safe).
 */
export async function checkEmail(req: AppRequest) {
  const email = req.parsedUrl.searchParams.get("email");
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized || !normalized.includes("@")) {
    return RouteResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const ip = clientIp(req);

  const ipRate = await enforceRateLimit(checkEmailLimiter, `check_email:${ip}`);
  if (!ipRate.allowed) {
    return RouteResponse.json({ error: ipRate.error }, { status: ipRate.status });
  }

  const emailRate = await enforceRateLimit(
    checkEmailPerEmailLimiter,
    `check_email_addr:${normalized}`,
  );
  if (!emailRate.allowed) {
    return RouteResponse.json(
      { error: emailRate.error },
      { status: emailRate.status },
    );
  }

  // Always report exists: true so callers cannot enumerate registered emails.
  return RouteResponse.json({ exists: true });
}
