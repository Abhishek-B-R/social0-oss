import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LandingPageView } from "@/components/landing/LandingPageView";

export const metadata: Metadata = {
  title: "Social0 — Marketing site",
  description:
    "Social0 lets you write once and publish everywhere. Schedule posts to Twitter, Instagram, LinkedIn, TikTok, YouTube, Pinterest, Bluesky, Threads, and Facebook from one dashboard.",
  alternates: { canonical: "https://social0.app/home" },
  robots: { index: true, follow: true },
};

export default async function HomeLandingPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return <LandingPageView signedIn={!!session} />;
}
