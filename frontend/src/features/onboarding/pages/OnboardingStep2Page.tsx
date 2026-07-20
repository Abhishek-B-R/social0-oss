import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { setOnboardingGoal } from "@/api/onboarding";
import { DOCS_ONBOARDING_GOAL_URL } from "@/lib/docs-url";

const GOALS = [
  { id: "personal_brand", label: "Grow my personal brand" },
  { id: "business", label: "Promote my business or startup" },
  { id: "clients", label: "Manage content for clients" },
  { id: "exploring", label: "Just exploring" },
] as const;

/** Step 1 — goal picker (shown before the paywall). */
export default function OnboardingGoalPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleNext() {
    if (!selected) return;
    setSaving(true);
    try {
      await setOnboardingGoal(selected);
      navigate("/onboarding/step2", { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center">
      <div className="relative mx-auto w-full max-w-3xl">
        <a
          href={DOCS_ONBOARDING_GOAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-0 top-0 z-10 flex items-center gap-2 rounded-full p-1.5 text-text-muted transition-colors hover:bg-muted hover:text-text"
          title="Documentation for this page"
          aria-label="Documentation for this page"
        >
          <svg
            className="h-4 w-4"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        </a>
        <h1 className="mb-2 text-center font-serif text-2xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-3xl">
          What&apos;s your goal?
        </h1>
        <p className="mb-8 text-center text-muted-foreground">
          Optional - helps us personalize your experience. You can skip this.
        </p>

        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GOALS.map((goal) => (
            <button
              key={goal.id}
              type="button"
              onClick={() => setSelected(goal.id)}
              className={`rounded-xl border-2 px-4 py-4 text-left font-medium transition-colors ${
                selected === goal.id
                  ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                  : "border-border bg-card text-foreground hover:border-emerald-300 hover:bg-muted/50"
              }`}
            >
              {goal.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleNext}
            disabled={saving || !selected}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "…" : "Next →"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/onboarding/step2")}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
