import { useLandingHashScroll } from "@/lib/scroll-to-hash";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { PlatformStrip } from "@/components/landing/PlatformStrip";
import { DemoVideoSection } from "@/components/landing/DemoVideoSection";
import { WhoIsItFor } from "@/components/landing/WhoIsItFor";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { SupportedPlatforms } from "@/components/landing/SupportedPlatforms";
import { FounderSection } from "@/components/landing/FounderSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

export function LandingPageView({ signedIn }: { signedIn: boolean }) {
  useLandingHashScroll();

  return (
    <div className="min-h-screen bg-background landing">
      <LandingHeader />
      <main>
        <Hero signedIn={signedIn} />
        <PlatformStrip />
        <DemoVideoSection />
        <WhoIsItFor />
        <HowItWorks />
        <FeaturesSection />
        <SupportedPlatforms />
        <FounderSection />
        <PricingSection signedIn={signedIn} />
        <FAQ />
        <FinalCTA signedIn={signedIn} />
      </main>
      <LandingFooter />
    </div>
  );
}
