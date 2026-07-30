import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { FinalCTA } from "@/components/landing/FinalCTA";

export function MarketingPageLayout({
  children,
  showCta = true,
}: {
  children: React.ReactNode;
  showCta?: boolean;
}) {
  return (
    <div className="landing landing-page flex min-h-screen flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1">{children}</main>
      {showCta ? <FinalCTA /> : null}
      <LandingFooter />
    </div>
  );
}
