import { useSession } from "@/lib/auth-client";
import { PageContainer } from "@/components/app";
import { GuestSignInPrompt } from "@/components/dashboard/GuestSignInPrompt";
import { FeedbackPageSkeleton } from "@/components/ui/page-skeletons";
import { FeedbackBoard, FeedbackHeader } from "./FeedbackBoard";

export function FeedbackPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <FeedbackPageSkeleton />;
  }

  if (!session) {
    return (
      <PageContainer stack>
        <FeedbackHeader />
        <GuestSignInPrompt
          title="Sign in to share feedback"
          description="Vote on features, report bugs, and suggest improvements. Sign in so we can attribute your feedback to your account."
        />
      </PageContainer>
    );
  }

  return <FeedbackBoard />;
}
