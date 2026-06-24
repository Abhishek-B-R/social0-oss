import { useSession } from "@/lib/auth-client";
import { GuestSignInPrompt } from "@/components/dashboard/GuestSignInPrompt";
import DocsInfoIcon from "@/components/info-icon";
import { DOCS_FEEDBACK_URL } from "@/lib/docs-url";
import { FeedbackClient } from "@/features/dashboard/feedback/FeedbackClient";

export function FeedbackPage() {
  const { data: session } = useSession();

  if (!session) {
    return (
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b border-border bg-bg-elevated px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
              Feedback or Feature Request
            </h1>
            <DocsInfoIcon url={DOCS_FEEDBACK_URL} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Vote on features, report bugs, and suggest improvements. Or you can
            always email us at{" "}
            <a
              href="mailto:support@social0.app"
              className="text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              support@social0.app
            </a>
            .
          </p>
        </header>
        <div className="mt-6">
          <GuestSignInPrompt
            title="Sign in to share feedback"
            description="Vote on features, report bugs, and suggest improvements. Sign in so we can attribute your feedback to your account."
          />
        </div>
      </div>
    );
  }

  return <FeedbackClient />;
}
