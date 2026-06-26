import { auth } from "@/lib/auth";
import { getLegalStatus, recordLegalAcceptances } from "@/lib/legal";
import { clientIp } from "@/lib/client-ip";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { acceptTerms, acceptPrivacy, marketingOptIn } = body as {
    acceptTerms?: boolean;
    acceptPrivacy?: boolean;
    marketingOptIn?: boolean;
  };

  if (!acceptTerms || !acceptPrivacy) {
    return NextResponse.json(
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
    return NextResponse.json(
      { error: "Could not record legal acceptance.", code: "LEGAL_CONSENT_REQUIRED" },
      { status: 400 },
    );
  }

  const status = await getLegalStatus(session.user.id);
  return NextResponse.json(status);
}
