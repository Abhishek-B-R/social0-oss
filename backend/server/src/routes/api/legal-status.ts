import { auth } from "../../lib/auth.js";
import { getLegalStatus } from "../../lib/legal.js";
import { headers } from "../../lib/shim/next-headers.js";
import { NextResponse } from "../../lib/shim/next-server.js";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getLegalStatus(session.user.id);
  return NextResponse.json(status);
}
