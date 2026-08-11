import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { LandingPageView } from "@/components/landing/LandingPageView";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { buildFaqJsonLd, buildHomeJsonLd } from "@/lib/seo";
import { landingFaqs } from "@/components/landing/landing-faqs";

export function HomePage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isPending && session) {
      navigate("/auth/continue", { replace: true });
    }
  }, [isPending, session, navigate]);

  // Keep landing visible while auth resolves so crawlers and first paint get real content.
  if (session) return null;

  return (
    <>
      <PseoJsonLd graphs={[...buildHomeJsonLd("/"), buildFaqJsonLd(landingFaqs)]} />
      <LandingPageView signedIn={false} />
    </>
  );
}
