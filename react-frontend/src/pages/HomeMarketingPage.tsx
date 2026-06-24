import { useSession } from "@/lib/auth-client";
import { LandingPageView } from "@/components/landing/LandingPageView";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { buildHomeJsonLd } from "@/lib/seo";

export function HomeMarketingPage() {
  const { data: session } = useSession();
  return (
    <>
      <PseoJsonLd graphs={buildHomeJsonLd("/home")} />
      <LandingPageView signedIn={!!session} />
    </>
  );
}
