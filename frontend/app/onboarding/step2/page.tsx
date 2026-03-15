"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { setOnboardingGoal } from "@/app/actions/onboarding";
import { MdQuestionMark } from "react-icons/md";
import { DOCS_ONBOARDING_GOAL_URL } from "@/lib/docs-url";

const GOALS = [
  { id: "personal_brand", label: "Grow my personal brand" },
  { id: "business", label: "Promote my business or startup" },
  { id: "clients", label: "Manage content for clients" },
  { id: "exploring", label: "Just exploring" },
] as const;

export default function OnboardingGoalPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paid = searchParams.get("paid") === "1";
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const syncAttempted = useRef(false);

  // After payment redirect, sync subscription from Dodo so step3 connect sees the plan (webhook may not have run yet)
  useEffect(() => {
    if (!paid || syncAttempted.current) return;
    syncAttempted.current = true;
    fetch("/api/billing/sync", { method: "POST", credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok === true) router.refresh();
      })
      .catch(() => {});
  }, [paid, router]);

  useEffect(() => {
    if (paid) {
      const duration = 2_000;
      const end = Date.now() + duration;
      const frame = () => {
        confetti({
          particleCount: 2,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ["#10b981", "#34d399", "#6ee7b7"],
        });
        confetti({
          particleCount: 2,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ["#10b981", "#34d399", "#6ee7b7"],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }, [paid]);

  async function handleNext() {
    if (!selected) return;
    setSaving(true);
    try {
      await setOnboardingGoal(selected);
      router.push("/onboarding/step3");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <a
        href={DOCS_ONBOARDING_GOAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <MdQuestionMark className="h-4 w-4" />
      </a>
      <h1 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-2">
        What&apos;s your goal?
      </h1>
      <p className="text-center text-muted-foreground mb-8">
        Help us tailor your experience — choose one to continue.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {GOALS.map((goal) => (
          <button
            key={goal.id}
            type="button"
            onClick={() => setSelected(goal.id)}
            className={`rounded-xl border-2 px-4 py-4 text-left font-medium transition-colors ${
              selected === goal.id
                ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                : "border-border bg-card hover:border-emerald-300 hover:bg-muted/50 text-foreground"
            }`}
          >
            {goal.label}
          </button>
        ))}
      </div>

      <div className="flex justify-center mb-10">
        <button
          type="button"
          onClick={handleNext}
          disabled={saving || !selected}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "…" : "Next →"}
        </button>
      </div>

      {/* <blockquote className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground italic">
        &ldquo;Social0 saved me hours every week. I schedule everything in one
        place and my engagement went up.&rdquo;
        <footer className="mt-2 not-italic text-foreground font-medium">
          — Early user
        </footer>
      </blockquote> */}
    </div>
  );
}
