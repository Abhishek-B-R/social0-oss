import { PageContainer, PageHeader } from "@/components/app";
import { GuestSignInPrompt } from "./GuestSignInPrompt";

type GuestPostsPageViewProps = {
  pageTitle: string;
  promptTitle?: string;
  promptDescription?: string;
};

export function GuestPostsPageView({
  pageTitle,
  promptTitle = "Sign in to see your posts",
  promptDescription = "Your drafts, scheduled posts, and publishing history will appear here after you sign in.",
}: GuestPostsPageViewProps) {
  return (
    <PageContainer stack>
      <PageHeader title={pageTitle} />
      <GuestSignInPrompt title={promptTitle} description={promptDescription} />
    </PageContainer>
  );
}
