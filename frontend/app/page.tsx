import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { PlatformStrip } from "@/components/landing/PlatformStrip";
import { DashboardMockup } from "@/components/landing/DashboardMockup";
import { WhoIsItFor } from "@/components/landing/WhoIsItFor";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { SupportedPlatforms } from "@/components/landing/SupportedPlatforms";
import { FounderSection } from "@/components/landing/FounderSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background landing">
      <LandingHeader />
      <main>
        <Hero />
        <PlatformStrip />
        <DashboardMockup />
        <WhoIsItFor />
        <HowItWorks />
        <FeaturesSection />
        <SupportedPlatforms />
        <FounderSection />
        <PricingSection />
        <FAQ />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
