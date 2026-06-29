import { RouteResponse } from "../../lib/shim/http.js";
import { env } from "../../lib/env.js";


/** Public Canny board token for embedded widget (same value as NEXT_PUBLIC_CANNY_BOARD_TOKEN). */
export async function cannyConfig() {
  const boardToken = env.NEXT_PUBLIC_CANNY_BOARD_TOKEN?.trim() ?? "";
  if (!boardToken) {
    return RouteResponse.json(
      { error: "Canny board not configured" },
      { status: 503 },
    );
  }
  return RouteResponse.json({ boardToken });
}
