import { useLandingHashScroll } from "@/lib/scroll-to-hash";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { DemoVideoSection } from "@/components/landing/DemoVideoSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { AgentDemosSection } from "@/components/landing/AgentDemosSection";
import { DevelopersSection } from "@/components/landing/DevelopersSection";
import { SupportedPlatforms } from "@/components/landing/SupportedPlatforms";
import { FounderSection } from "@/components/landing/FounderSection";
import { SocialProofSection } from "@/components/landing/SocialProofSection";
import { ProductMomentsSection } from "@/components/landing/ProductMomentsSection";
import { PricingTeaser } from "@/components/landing/PricingTeaser";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import {
  LandingModeProvider,
  useLandingMode,
} from "@/components/landing/landing-mode";

/**
 * Hero → demo → (agent: AI agents demos) → product moments → developers
 * → stories → founder → platforms → pricing → FAQ → CTA
 *
 * Sections mount eagerly (no DeferredSection). Demo videos stay paused
 * until scrolled into view, then pause again when scrolled past.
 */
function LandingMain({ signedIn }: { signedIn: boolean }) {
  const { mode } = useLandingMode();

  return (
    <main>
      <Hero signedIn={signedIn} />
      <DemoVideoSection />
      {mode === "agent" ? <AgentDemosSection /> : null}
      <ProductMomentsSection signedIn={signedIn} />
      <DevelopersSection />
      <SocialProofSection signedIn={signedIn} />
      <FounderSection signedIn={signedIn} />
      <SupportedPlatforms />
      <PricingTeaser signedIn={signedIn} />
      <FAQ />
      <FinalCTA signedIn={signedIn} />
    </main>
  );
}

export function LandingPageView({ signedIn }: { signedIn: boolean }) {
  useLandingHashScroll();

  return (
    <LandingModeProvider>
      <div className="landing landing-page min-h-screen bg-background text-foreground">
        <LandingHeader />
        <LandingMain signedIn={signedIn} />
        <LandingFooter />
      </div>
    </LandingModeProvider>
  );
}
