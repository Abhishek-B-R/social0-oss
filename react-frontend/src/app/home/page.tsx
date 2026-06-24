import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LandingPageView } from "@/components/landing/LandingPageView";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { buildHomeJsonLd, buildHomeMetadata } from "@/lib/seo";

export const metadata = buildHomeMetadata("/home");

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <>
      <PseoJsonLd graphs={buildHomeJsonLd("/home")} />
      <LandingPageView signedIn={!!session} />
    </>
  );
}
