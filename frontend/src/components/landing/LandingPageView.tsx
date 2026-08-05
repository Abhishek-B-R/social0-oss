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

const ProblemSolution = lazy(() =>
  import("@/components/landing/ProblemSolution").then((m) => ({
    default: m.ProblemSolution,
  })),
);
const WhoIsItFor = lazy(() =>
  import("@/components/landing/WhoIsItFor").then((m) => ({
    default: m.WhoIsItFor,
  })),
);
const AgentDemosSection = lazy(() =>
  import("@/components/landing/AgentDemosSection").then((m) => ({
    default: m.AgentDemosSection,
  })),
);
const HowItWorks = lazy(() =>
  import("@/components/landing/HowItWorks").then((m) => ({
    default: m.HowItWorks,
  })),
);
const FeaturesSection = lazy(() =>
  import("@/components/landing/FeaturesSection").then((m) => ({
    default: m.FeaturesSection,
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
 * Hero → demo → (agent: AI agents demos) → stories → features → platforms
 * → developers → how it works → problem/solution → persona → pricing → FAQ → CTA → founder
 */
function LandingMain({ signedIn }: { signedIn: boolean }) {
  const { mode } = useLandingMode();

  return (
    <main>
      <Hero signedIn={signedIn} />
      <DemoVideoSection />
      {mode === "agent" ? (
        <DeferredSection minHeight="28rem">
          <AgentDemosSection />
        </DeferredSection>
      ) : null}
      <DeferredSection>
        <SocialProofSection />
      </DeferredSection>
      <SectionSeparator />
      <DeferredSection>
        <FeaturesSection />
      </DeferredSection>
      <DeferredSection>
        <SupportedPlatforms />
      </DeferredSection>
      <DeferredSection>
        <DevelopersSection />
      </DeferredSection>
      <DeferredSection>
        <HowItWorks />
      </DeferredSection>
      <DeferredSection>
        <ProblemSolution />
      </DeferredSection>
      <DeferredSection>
        <WhoIsItFor />
      </DeferredSection>
      <SectionSeparator />
      <DeferredSection>
        <PricingTeaser />
      </DeferredSection>
      <DeferredSection>
        <FAQ />
      </DeferredSection>
      <DeferredSection>
        <FinalCTA signedIn={signedIn} />
      </DeferredSection>
      <DeferredSection>
        <FounderSection />
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
