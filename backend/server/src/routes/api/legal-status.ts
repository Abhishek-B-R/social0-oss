import { auth } from "../../lib/auth.js";
import { getLegalStatus } from "../../lib/legal.js";
import { headers } from "../../lib/shim/request-cookies.js";
import { RouteResponse } from "../../lib/shim/http.js";

export async function legalStatus() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getLegalStatus(session.user.id);
  return RouteResponse.json(status);
}
