import { useState } from "react";
import { usePostHog } from "@posthog/react";
import { useQuery } from "@tanstack/react-query";
import { getOnboardingStatus } from "@/api/onboarding";
import { Bot, PenLine, Shuffle } from "lucide-react";
import { DOCS_MCP_QUICKSTART_URL, DOCS_ONBOARDING_COMPLETE_URL } from "@/lib/docs-url";
import { cn } from "@/lib/utils";
import {
  CLI_ONE_LINER,
  HOSTED_MCP_URL,
  POST_MODES,
  type PostMode,
} from "@/features/onboarding/lib/agent-setup";
import { ONBOARDING_PATHS } from "@/features/onboarding/lib/paths";
import {
  ChoiceCard,
  CopyField,
  OnboardingStepFrame,
  OnboardingStepHeader,
} from "./onboarding-ui";
import {
  onboardingGhostLinkClass,
  onboardingPrimaryCtaClass,
} from "./onboarding-styles";
import { useRadioGroupKeys } from "./use-radio-group-keys";
import { SeePlansLink } from "./PlansDialog";
import { useFinishOnboarding } from "./use-finish-onboarding";

const MODE_ICONS: Record<PostMode, typeof Bot> = {
  self: PenLine,
  agent: Bot,
  both: Shuffle,
};

const MODE_IDS = POST_MODES.map((m) => m.id);

/** The one-line setup for an AI agent, shown inside the selected card. */
function AgentSetup() {
  return (
    <div className="space-y-3 rounded-xl border border-agent-border bg-background/70 p-3.5">
      <CopyField
        label="MCP server URL"
        value={HOSTED_MCP_URL}
        hint="ChatGPT, Claude or Cursor: add it as a connector, then sign in with Social0. No API key needed."
      />
      <CopyField
        label="CLI one-liner"
        value={CLI_ONE_LINER}
        hint="Claude Code, scripts and other terminal agents. It opens your browser to sign in."
      />
      <p className="text-[12px] text-muted-foreground">
        Drafts your agent saves show up in Needs review for you to approve.{" "}
        <a
          href={DOCS_MCP_QUICKSTART_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
        >
          Setup guides
        </a>
      </p>
    </div>
  );
}

/** Step 3: "How will you post?" Choosing an agent shows the setup right here. */
export function PostModeStep({ onOpenPlans }: { onOpenPlans: () => void }) {
  const posthog = usePostHog();
  const [mode, setMode] = useState<PostMode | null>(null);
  const { finish, finishing } = useFinishOnboarding();
  const { data: status } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: getOnboardingStatus,
  });
  const { itemProps } = useRadioGroupKeys(MODE_IDS, mode, (next) => select(next));

  function select(next: PostMode) {
    setMode(next);
    posthog?.capture("onboarding_post_mode_selected", { post_mode: next });
  }

  return (
    <OnboardingStepFrame>
      <OnboardingStepHeader
        step={3}
        back={ONBOARDING_PATHS.connect}
        docsHref={DOCS_ONBOARDING_COMPLETE_URL}
        title="How will you post?"
        description="You can switch anytime. Your agent and you share the same calendar, accounts and queue."
      />

      <div role="radiogroup" aria-label="How you'll post" className="mb-8 space-y-2.5">
        {POST_MODES.map((m) => {
          const Icon = MODE_ICONS[m.id];
          const withAgent = m.id !== "self";
          return (
            <ChoiceCard
              key={m.id}
              selected={mode === m.id}
              onSelect={() => select(m.id)}
              title={m.title}
              description={m.description}
              icon={<Icon className="h-4 w-4" />}
              tone={withAgent ? "agent" : "default"}
              {...itemProps(m.id)}
            >
              {withAgent ? <AgentSetup /> : null}
            </ChoiceCard>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={() =>
            void finish({ at: "post_mode", skipped: true, postMode: null })
          }
          disabled={finishing}
          className={cn(onboardingGhostLinkClass, "order-2 sm:order-1")}
        >
          Decide later
        </button>
        <button
          type="button"
          onClick={() => void finish({ at: "post_mode", postMode: mode })}
          disabled={finishing || !mode}
          className={cn(onboardingPrimaryCtaClass, "order-1 w-full sm:order-2 sm:w-auto")}
        >
          {finishing ? "Opening Home…" : "Finish setup"}
        </button>
      </div>

      {status && !status.hasSubscription ? (
        <p className="mt-6 text-center text-[13px] text-muted-foreground sm:text-left">
          You're on Free. Upgrade when you need more accounts or automations.{" "}
          <SeePlansLink onOpen={onOpenPlans} />
        </p>
      ) : null}
    </OnboardingStepFrame>
  );
}
