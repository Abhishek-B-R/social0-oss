import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSubscriptionForUser } from "@/lib/subscription";
import { checkAccountLimits, checkTwitterTweetLimit } from "@/lib/plan-limits";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { BillingClient } from "./BillingClient";
import { DOCS_BILLING_URL } from "@/lib/docs-url";
import DocsInfoIcon from "@/components/info-icon";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string; success?: string; status?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const params = await searchParams;
  const showUpgradeBanner = params.upgrade === "1";
  const justSubscribed = params.success === "1" && params.status !== "failed";

  const { dateFormat, timezone } = await getUserSettingsSnapshot();
  const subscription = await getSubscriptionForUser(session.user.id);
  const accountLimit = await checkAccountLimits(
    session.user.id,
    "linkedin", // just to get current counts and limits
  );
  const twitterTweetLimit = await checkTwitterTweetLimit(session.user.id);

  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
          Billing
        </h1>
        <DocsInfoIcon url={DOCS_BILLING_URL} />
      </div>
      <p className="mt-1 text-text-muted">
        Manage your subscription and billing.
      </p>
      {showUpgradeBanner && (
        <div className="mt-6 rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm text-text">
          Upgrade to the Growth plan or higher plans to use bulk tools,
          auto-plug, and auto-repost.
        </div>
      )}
      <div className="mt-5">
        <BillingClient
          subscription={subscription}
          accountLimit={accountLimit}
          twitterTweetLimit={twitterTweetLimit}
          justSubscribed={justSubscribed}
          dateFormat={dateFormat}
          timezone={timezone}
        />
      </div>
    </div>
  );
}
