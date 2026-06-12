"use client";

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
      <h1 className="mb-2 font-serif text-2xl font-semibold tracking-tight text-foreground landing sm:text-3xl">
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
