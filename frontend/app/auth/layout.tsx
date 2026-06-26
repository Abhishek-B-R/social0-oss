import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in to Social0 - Social Media Scheduling",
  description:
    "Sign in or create your Social0 account. Schedule and publish posts to Twitter, Instagram, LinkedIn, TikTok, and 5 more platforms from one dashboard.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://social0.app/auth" },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing min-h-screen bg-background font-sans text-foreground antialiased">
      {children}
    </div>
  );
}
