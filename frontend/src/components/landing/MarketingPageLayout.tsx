import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { LandingModeProvider } from "@/components/landing/landing-mode";

export function MarketingPageLayout({
  children,
  showCta = true,
}: {
  children: React.ReactNode;
  showCta?: boolean;
}) {
  return (
    <LandingModeProvider>
      <div className="landing landing-page flex min-h-screen flex-col bg-background text-foreground">
        <LandingHeader />
        <main className="flex-1">{children}</main>
        {showCta ? <FinalCTA /> : null}
        <LandingFooter />
      </div>
    </LandingModeProvider>
  );
}
