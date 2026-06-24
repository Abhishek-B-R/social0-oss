import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { LandingPageView } from "@/components/landing/LandingPageView";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { buildHomeJsonLd } from "@/lib/seo";

export function HomePage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isPending && session) {
      navigate("/dashboard", { replace: true });
    }
  }, [isPending, session, navigate]);

  if (isPending || session) return null;

  return (
    <>
      <PseoJsonLd graphs={buildHomeJsonLd("/")} />
      <LandingPageView signedIn={false} />
    </>
  );
}
