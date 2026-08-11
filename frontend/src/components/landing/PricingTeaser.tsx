import { useState } from "react";
import { PricingCards } from "@/components/landing/PricingSection";
import type { BillingInterval } from "@/lib/plans";

/** Same plans + feature points as /pricing; compare link jumps to that page. */
export function PricingTeaser({ signedIn = false }: { signedIn?: boolean }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <PricingCards
      id="pricing"
      signedIn={signedIn}
      interval={interval}
      onIntervalChange={setInterval}
      headingAs="h2"
      compareHref="/pricing#compare"
    />
  );
}
