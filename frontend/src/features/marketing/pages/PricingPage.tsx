import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { PricingCards } from "@/components/landing/PricingSection";
import { PricingComparisonTable } from "@/components/landing/PricingComparisonTable";
import { PricingFaq } from "@/components/landing/PricingFaq";
import { SeoHead } from "@/components/seo/SeoHead";
import type { BillingInterval } from "@/lib/plans";
import { scrollToHash } from "@/lib/scroll-to-hash";
import { absoluteUrl } from "@/lib/seo";

/**
 * Pricing page: tiers → comparison → FAQ → Final CTA (layout)
 */
export default function PricingPage() {
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => scrollToHash(hash), 50);
    return () => window.clearTimeout(t);
  }, [hash]);

  return (
    <MarketingPageLayout signedIn={signedIn}>
      <SeoHead
        title="Pricing — Social0"
        description="Simple Social0 pricing. Start free, then upgrade to Starter, Growth, or Pro. Every plan includes REST API, MCP, and CLI. Compare every feature side by side."
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
        wide
      />
      <PricingComparisonTable interval={interval} signedIn={signedIn} />
      <PricingFaq />
    </MarketingPageLayout>
  );
}
