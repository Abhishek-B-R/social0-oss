"use client";

import { EditPostForm } from "./EditPostForm";
import { useAccountsForForm } from "../create/useAccountsForForm";
import { AccountsGridSkeleton } from "../create/AccountsGridSkeleton";
import type { PostForEdit } from "./posts-list-data";
import type { PostMediaRow } from "./posts-list-data";

type EditPostWithAccountsClientProps = {
  post: PostForEdit;
  existingMedia: PostMediaRow[];
  use24HourTimeFormat: boolean;
  dateFormat: string | null;
};

export function EditPostWithAccountsClient({
  post,
  existingMedia,
  use24HourTimeFormat,
  dateFormat,
}: EditPostWithAccountsClientProps) {
  const { accounts, loading, error } = useAccountsForForm(null);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm space-y-4 animate-pulse">
          <div className="h-6 w-32 rounded bg-bg-muted" />
          <div className="h-10 w-full rounded-lg bg-bg-muted" />
        </div>
        <AccountsGridSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
        {error}{" "}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-medium underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <EditPostForm
      post={post}
      accounts={accounts}
      existingMedia={existingMedia}
      use24HourTimeFormat={use24HourTimeFormat}
      dateFormat={dateFormat}
    />
  );
}
