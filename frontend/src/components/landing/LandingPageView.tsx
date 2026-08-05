import { lazy } from "react";
import { useLandingHashScroll } from "@/lib/scroll-to-hash";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { DemoVideoSection } from "@/components/landing/DemoVideoSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { DeferredSection } from "@/components/landing/DeferredSection";
import { SectionSeparator } from "@/components/landing/SectionSeparator";
import {
  LandingModeProvider,
  useLandingMode,
} from "@/components/landing/landing-mode";

const AgentDemosSection = lazy(() =>
  import("@/components/landing/AgentDemosSection").then((m) => ({
    default: m.AgentDemosSection,
  })),
);
const DevelopersSection = lazy(() =>
  import("@/components/landing/DevelopersSection").then((m) => ({
    default: m.DevelopersSection,
  })),
);
const SupportedPlatforms = lazy(() =>
  import("@/components/landing/SupportedPlatforms").then((m) => ({
    default: m.SupportedPlatforms,
  })),
);
const FounderSection = lazy(() =>
  import("@/components/landing/FounderSection").then((m) => ({
    default: m.FounderSection,
  })),
);
const SocialProofSection = lazy(() =>
  import("@/components/landing/SocialProofSection").then((m) => ({
    default: m.SocialProofSection,
  })),
);
const ProductMomentsSection = lazy(() =>
  import("@/components/landing/ProductMomentsSection").then((m) => ({
    default: m.ProductMomentsSection,
  })),
);
const PricingTeaser = lazy(() =>
  import("@/components/landing/PricingTeaser").then((m) => ({
    default: m.PricingTeaser,
  })),
);
const FAQ = lazy(() =>
  import("@/components/landing/FAQ").then((m) => ({ default: m.FAQ })),
);
const FinalCTA = lazy(() =>
  import("@/components/landing/FinalCTA").then((m) => ({ default: m.FinalCTA })),
);

/**
 * Hero → demo → (agent: AI agents demos) → product moments → developers
 * → stories → founder → platforms → pricing → FAQ → CTA
 */
function LandingMain({ signedIn }: { signedIn: boolean }) {
  const { mode } = useLandingMode();

  return (
    <main>
      <Hero signedIn={signedIn} />
      <DemoVideoSection />
      {mode === "agent" ? (
        <DeferredSection minHeight="40rem">
          <AgentDemosSection />
        </DeferredSection>
      ) : null}
      <DeferredSection minHeight="48rem">
        <ProductMomentsSection signedIn={signedIn} />
      </DeferredSection>
      <DeferredSection>
        <DevelopersSection />
      </DeferredSection>
      <DeferredSection>
        <SocialProofSection />
      </DeferredSection>
      <DeferredSection>
        <FounderSection signedIn={signedIn} />
      </DeferredSection>
      <DeferredSection>
        <SupportedPlatforms />
      </DeferredSection>
      <SectionSeparator />
      <DeferredSection>
        <PricingTeaser signedIn={signedIn} />
      </DeferredSection>
      <DeferredSection>
        <FAQ />
      </DeferredSection>
      <DeferredSection>
        <FinalCTA signedIn={signedIn} />
      </DeferredSection>
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
