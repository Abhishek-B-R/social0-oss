import { lazy } from "react";
import { useLandingHashScroll } from "@/lib/scroll-to-hash";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { DeferredSection } from "@/components/landing/DeferredSection";
import { SectionSeparator } from "@/components/landing/SectionSeparator";

const DemoVideoSection = lazy(() =>
  import("@/components/landing/DemoVideoSection").then((m) => ({
    default: m.DemoVideoSection,
  })),
);
const WhoIsItFor = lazy(() =>
  import("@/components/landing/WhoIsItFor").then((m) => ({
    default: m.WhoIsItFor,
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
const SupportedPlatforms = lazy(() =>
  import("@/components/landing/SupportedPlatforms").then((m) => ({
    default: m.SupportedPlatforms,
  })),
);
const DevelopersSection = lazy(() =>
  import("@/components/landing/DevelopersSection").then((m) => ({
    default: m.DevelopersSection,
  })),
);
const FounderSection = lazy(() =>
  import("@/components/landing/FounderSection").then((m) => ({
    default: m.FounderSection,
  })),
);
const PricingSection = lazy(() =>
  import("@/components/landing/PricingSection").then((m) => ({
    default: m.PricingSection,
  })),
);
const FAQ = lazy(() =>
  import("@/components/landing/FAQ").then((m) => ({ default: m.FAQ })),
);
const FinalCTA = lazy(() =>
  import("@/components/landing/FinalCTA").then((m) => ({ default: m.FinalCTA })),
);

export function LandingPageView({ signedIn }: { signedIn: boolean }) {
  useLandingHashScroll();

  return (
    <div className="landing landing-page min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main>
        <Hero signedIn={signedIn} />
        <SectionSeparator className="my-2" />
        <DeferredSection minHeight="20rem">
          <DemoVideoSection />
        </DeferredSection>
        <DeferredSection>
          <WhoIsItFor />
        </DeferredSection>
        <DeferredSection>
          <HowItWorks />
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
          <FounderSection />
        </DeferredSection>
        <SectionSeparator />
        <DeferredSection minHeight="28rem">
          <PricingSection signedIn={signedIn} />
        </DeferredSection>
        <DeferredSection>
          <FAQ />
        </DeferredSection>
        <DeferredSection>
          <FinalCTA signedIn={signedIn} />
        </DeferredSection>
      </main>
      <LandingFooter />
    </div>
  );
}
