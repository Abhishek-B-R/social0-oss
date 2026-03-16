import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
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

export const metadata: Metadata = {
  title: "Social0 — Post and Schedule to All Your Socials from One Place",
  description:
    "Social0 lets you write once and publish everywhere. Schedule posts to Twitter, Instagram, LinkedIn, TikTok, YouTube, Pinterest, Bluesky, Threads, and Facebook from one dashboard. 7-day free trial.",
  keywords: [
    "social media scheduler",
    "social media management",
    "schedule tweets",
    "instagram scheduler",
    "tiktok scheduler",
    "social media publishing",
  ],
  openGraph: {
    title: "Social0 — Post and Schedule to All Your Socials from One Place",
    description:
      "Write once. Publish everywhere. Schedule posts to 9 platforms from one dashboard.",
    url: "https://social0.app",
    siteName: "Social0",
    type: "website",
    images: [
      {
        url: "https://social0.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "Social0 — Social Media Scheduling Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Social0 — Post and Schedule to All Your Socials from One Place",
    description:
      "Write once. Publish everywhere. Schedule posts to 9 platforms from one dashboard.",
    images: ["https://social0.app/og-image.png"],
    creator: "@social0_app",
  },
  alternates: { canonical: "https://social0.app" },
  robots: { index: true, follow: true },
};

export default async function LandingPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="min-h-screen bg-background landing">
      <LandingHeader />
      <main>
        <Hero signedIn={!!session} />
        <PlatformStrip />
        <DashboardMockup />
        <WhoIsItFor />
        <HowItWorks />
        <FeaturesSection />
        <SupportedPlatforms />
        <FounderSection />
        <PricingSection signedIn={!!session} />
        <FAQ />
        <FinalCTA signedIn={!!session} />
      </main>
      <LandingFooter />
    </div>
  );
}
