import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ConnectionsSkeleton } from "@/components/dashboard/ConnectionsSkeleton";
import { OAuthErrorHandler } from "@/components/OAuthErrorHandler";
import { ConnectionsList } from "@/components/dashboard/ConnectionsList";
import {
  runTokenHealthCheckForUser,
  NEVER_EXPIRES_PLATFORMS,
} from "@/lib/token-health";
import { checkAccountLimits } from "@/lib/plan-limits";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Skip expiry warnings for platforms that auto-refresh (YouTube, TikTok). */
const SKIP_EXPIRY_DISPLAY = new Set(["youtube", "tiktok"]);

function getTokenStatus(
  dbTokenStatus: string | null,
  expiresAt: Date | null,
  platform: string,
): "ok" | "expiring_soon" | "expired" {
  if (dbTokenStatus === "expired") return "expired";
  if (NEVER_EXPIRES_PLATFORMS.has(platform)) return "ok";
  if (SKIP_EXPIRY_DISPLAY.has(platform)) return "ok";
  if (!expiresAt) return "ok";
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  if (exp < now) return "expired";
  if (exp < now + 7 * ONE_DAY_MS) return "expiring_soon";
  return "ok";
}

function getExpiresInDays(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  if (exp < now) return null;
  return Math.ceil((exp - now) / ONE_DAY_MS);
}

async function ConnectionsContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  await runTokenHealthCheckForUser(session.user.id);

  const [accounts, accountLimit] = await Promise.all([
    db.query.connectedAccounts.findMany({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.isActive, true),
      ),
      columns: {
        id: true,
        platform: true,
        platformUsername: true,
        profileImageUrl: true,
        isActive: true,
        tokenExpiresAt: true,
        tokenStatus: true,
        isTwitterPremium: true,
      },
    }),
    checkAccountLimits(session.user.id, "linkedin"),
  ]);

  return (
    <>
      <OAuthErrorHandler />
      <ConnectionsList
        accounts={accounts.map((a) => {
          const status = getTokenStatus(
            a.tokenStatus ?? null,
            a.tokenExpiresAt ?? null,
            a.platform,
          );
          const expiresInDays = getExpiresInDays(a.tokenExpiresAt ?? null);
          return {
            id: a.id,
            platform: a.platform,
            platformUsername: a.platformUsername,
            profileImageUrl: a.profileImageUrl,
            isActive: a.isActive,
            isTwitterPremium: a.isTwitterPremium ?? false,
            tokenStatus: status,
            expiresInDays: status === "expiring_soon" ? expiresInDays : null,
          };
        })}
        accountLimit={
          accountLimit.currentTotal >= accountLimit.limitTotal
            ? { currentTotal: accountLimit.currentTotal, limitTotal: accountLimit.limitTotal }
            : undefined
        }
      />
      <p className="mt-4 text-sm text-text-muted">
        Having trouble connecting your accounts?{" "}
        <a
          href="mailto:support@social0.app"
          className="font-medium text-primary underline underline-offset-2 hover:no-underline"
        >
          Email support@social0.app
        </a>
      </p>
    </>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<ConnectionsSkeleton />}>
      <ConnectionsContent />
    </Suspense>
  );
}
