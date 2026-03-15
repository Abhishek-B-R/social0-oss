import { setOnboardingCompleted } from "@/app/actions/onboarding";
import { OnboardingStep4Client } from "./OnboardingStep4Client";
import { MdQuestionMark } from "react-icons/md";
import { DOCS_ONBOARDING_COMPLETE_URL } from "@/lib/docs-url";

export default async function OnboardingStep4Page() {
  await setOnboardingCompleted();
  return (
    <>
      <a
        href={DOCS_ONBOARDING_COMPLETE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <MdQuestionMark className="h-4 w-4" />
      </a>
      <OnboardingStep4Client />
    </>
  );
}
