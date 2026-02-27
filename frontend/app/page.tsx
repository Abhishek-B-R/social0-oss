"use client";

import { signIn } from "@/lib/auth-client";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingFooter } from "@/components/LandingFooter";
import { HowItWorks } from "@/components/HowItWorks";
import { FeaturesSection } from "@/components/FeaturesSection";
import { SecuritySection } from "@/components/SecuritySection";
import { SupportedPlatforms } from "@/components/SupportedPlatforms";
import { PricingSection } from "@/components/PricingSection";
import { FAQ } from "@/components/FAQ";
import { PlatformMarquee } from "@/components/PlatformMarquee";
import { HeroMockup } from "@/components/HeroMockup";
import { RevealSection } from "@/components/RevealSection";

export default function Home() {
  const handleTryFree = () => {
    signIn.social({
      provider: "google",
      callbackURL: "/dashboard/create",
    });
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-background font-sans text-foreground"
      suppressHydrationWarning
    >
      <LandingHeader />
      <main className="bg-background">
        {/* Hero */}
        <section
          className="relative py-16 sm:py-20 px-4 sm:px-6 lg:px-8 overflow-hidden"
          style={{ animation: "bannerSlideUp 0.6s ease-out" }}
        >
          {/* Subtle emerald radial gradient background */}
          <div className="absolute inset-0 bg-gradient-radial from-emerald-100/60 via-emerald-50/40 to-transparent pointer-events-none dark:from-emerald-950/40 dark:via-emerald-950/20" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(5,150,105,0.15),transparent_50%)] pointer-events-none dark:bg-[radial-gradient(circle_at_50%_0%,rgba(5,150,105,0.18),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(5,150,105,0.12),transparent_50%)] pointer-events-none dark:bg-[radial-gradient(circle_at_80%_20%,rgba(5,150,105,0.16),transparent_55%)]" />
          <div className="relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="mb-8">
              <PlatformMarquee />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground tracking-tight mb-6">
              One post. All your social accounts. Zero hassle.
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto font-medium">
              Plan, schedule and publish your content with ease. Write once and
              hit every network from one dashboard.
            </p>
            <button
              onClick={handleTryFree}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 px-10 rounded-xl transition-colors text-base shadow-lg"
            >
              Try it free
            </button>
            <HeroMockup />
          </div>
          </div>
        </section>

        <HowItWorks />
        <FeaturesSection />
        <SecuritySection />
        <SupportedPlatforms />
        <PricingSection />
        <FAQ />

        {/* Final CTA */}
        <section className="py-16 sm:py-20 bg-emerald-50 dark:bg-emerald-950/30 relative overflow-hidden">
          <div className="relative">
            <RevealSection>
              <div className="max-w-2xl mx-auto px-4 text-center">
                <div className="rounded-2xl border border-border bg-card shadow-xl p-8 sm:p-10">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-4">
                    Ready to grow your presence?
                  </h2>
                  <p className="text-base text-muted-foreground mb-8 font-medium">
                    Join Social0 and publish everywhere from one place.
                  </p>
                  <button
                    onClick={handleTryFree}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 px-10 rounded-xl transition-all shadow-lg hover:scale-105"
                  >
                    Get started
                  </button>
                </div>
              </div>
            </RevealSection>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
