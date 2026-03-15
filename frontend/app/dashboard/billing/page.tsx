import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSubscriptionForUser } from "@/lib/subscription";
import { checkAccountLimits, checkTwitterTweetLimit } from "@/lib/plan-limits";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { BillingClient } from "./BillingClient";
import { MdQuestionMark } from "react-icons/md";
import { DOCS_BILLING_URL } from "@/lib/docs-url";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string; success?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const params = await searchParams;
  const showUpgradeBanner = params.upgrade === "1";
  const justSubscribed = params.success === "1";

  const { dateFormat, timezone } = await getUserSettingsSnapshot();
  const subscription = await getSubscriptionForUser(session.user.id);
  const accountLimit = await checkAccountLimits(
    session.user.id,
    "linkedin", // just to get current counts and limits
  );
  const twitterTweetLimit = await checkTwitterTweetLimit(session.user.id);

  return (
    <div>
      <a
        href={DOCS_BILLING_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <MdQuestionMark className="h-4 w-4" />
      </a>
      <h1 className="text-2xl font-extrabold text-text">Billing</h1>
      <p className="mt-1 text-text-muted">
        Manage your subscription and billing.
      </p>
      {showUpgradeBanner && (
        <div className="mt-6 rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm text-text">
          Upgrade to the Growth plan to use bulk tools, auto-plug, and
          auto-repost.
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
