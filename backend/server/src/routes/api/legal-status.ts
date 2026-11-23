import { getRouteSession } from "../../lib/session.js";
import { getLegalStatus } from "../../lib/legal.js";
import { RouteResponse } from "../../lib/http/http.js";

export async function legalStatus() {
  const session = await getRouteSession();
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getLegalStatus(session.user.id);
  return RouteResponse.json(status);
}
