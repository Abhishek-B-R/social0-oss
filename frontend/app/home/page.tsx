import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LandingPageView } from "@/components/landing/LandingPageView";

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

export default async function RootPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  return <LandingPageView signedIn={!!session} />;
}
