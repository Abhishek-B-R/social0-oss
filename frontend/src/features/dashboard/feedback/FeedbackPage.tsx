import { useSession } from "@/lib/auth-client";
import { GuestSignInPrompt } from "@/components/dashboard/GuestSignInPrompt";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";
import { FeedbackBoard, FeedbackHeader } from "./FeedbackBoard";

export function FeedbackPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <DashboardPageSkeleton message="Loading feedback..." />;
  }

  if (!session) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <FeedbackHeader />
        <div className="mt-6">
          <GuestSignInPrompt
            title="Sign in to share feedback"
            description="Vote on features, report bugs, and suggest improvements. Sign in so we can attribute your feedback to your account."
          />
        </div>
      </div>
    );
  }

  return <FeedbackBoard />;
}
