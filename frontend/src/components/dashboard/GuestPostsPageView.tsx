
import { GuestSignInPrompt } from "./GuestSignInPrompt";

type GuestPostsPageViewProps = {
  pageTitle: string;
  pageDescription: string;
  promptTitle?: string;
  promptDescription?: string;
};

export function GuestPostsPageView({
  pageTitle,
  pageDescription,
  promptTitle = "Sign in to see your posts",
  promptDescription = "Your drafts, scheduled posts, and publishing history will appear here after you sign in.",
}: GuestPostsPageViewProps) {
  return (
    <div>
      <h1 className="mb-2 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
        {pageTitle}
      </h1>
      <p className="mb-6 text-sm text-text-muted">{pageDescription}</p>
      <GuestSignInPrompt
        title={promptTitle}
        description={promptDescription}
      />
    </div>
  );
}
