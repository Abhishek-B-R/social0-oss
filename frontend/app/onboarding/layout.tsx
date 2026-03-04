import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/app/actions/onboarding";
import { OnboardingProgressClient } from "@/components/onboarding/OnboardingProgressClient";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  const status = await getOnboardingStatus();
  if (status?.onboardingCompleted) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur py-4 px-4">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-4">
          <OnboardingProgressClient />
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
