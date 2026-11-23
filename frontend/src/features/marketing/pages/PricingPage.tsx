import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PricingCards } from "@/components/landing/PricingSection";
import { PricingComparisonTable } from "@/components/landing/PricingComparisonTable";
import { PricingFaq } from "@/components/landing/PricingFaq";
import { SeoHead } from "@/components/seo/SeoHead";
import { PLAN_NAMES, type BillingInterval } from "@/lib/plans";
import { scrollToHash } from "@/lib/scroll-to-hash";
import { absoluteUrl } from "@/lib/seo";

/**
 * Pricing page: tiers → comparison → FAQ → Final CTA (layout)
 */
export default function PricingPage() {
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const { hash, key } = useLocation();

  // `key` changes on every navigation, so clicking the same #section link
  // again (same URL) still scrolls back to it.
  useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => scrollToHash(hash), 50);
    return () => window.clearTimeout(t);
  }, [hash, key]);

  return (
    <MarketingPageLayout signedIn={signedIn}>
      <SeoHead
        title={`Social0 Pricing: Free, ${PLAN_NAMES.creator} $29.90, ${PLAN_NAMES.agency} $59.90`}
        description={`Start free with 3 accounts. ${PLAN_NAMES.creator} $29.90/mo for 15 accounts, ${PLAN_NAMES.agency} $59.90/mo for 59 (+$1 per extra). Unlimited posts, API, MCP and CLI on every plan.`}
        path="/pricing"
        canonical={absoluteUrl("/pricing")}
        keywords={[
          "Social0 pricing",
          "social media scheduler pricing",
          "social media API pricing",
        ]}
      />
      <PricingCards
        signedIn={signedIn}
        interval={interval}
        onIntervalChange={setInterval}
        headingAs="h1"
      />
      <PricingComparisonTable interval={interval} signedIn={signedIn} />
      <PricingFaq />
    </MarketingPageLayout>
  );
}
