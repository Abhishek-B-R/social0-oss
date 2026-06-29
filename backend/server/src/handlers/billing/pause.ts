import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/shim/request-cookies.js";
import { RouteResponse } from "../../lib/shim/http.js";


export async function pauseSubscription(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const months = body.months as number | undefined;
  if (months !== 1 && months !== 2 && months !== 3) {
    return RouteResponse.json({ error: "Invalid months" }, { status: 400 });
  }

  // Dodo SDK currently doesn't expose a pause endpoint; direct users to feedback/support.
  return RouteResponse.json(
    { error: "not_supported" },
    { status: 501 },
  );
}

