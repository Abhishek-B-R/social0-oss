import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingPageView } from "@/components/landing/LandingPageView";
import { PseoJsonLd } from "@/components/seo/PseoJsonLd";
import { buildHomeJsonLd, buildHomeMetadata } from "@/lib/seo";

export const metadata = buildHomeMetadata("/");

export default async function RootPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard");
  }

  return (
    <>
      <PseoJsonLd graphs={buildHomeJsonLd("/")} />
      <LandingPageView signedIn={false} />
    </>
  );
}
