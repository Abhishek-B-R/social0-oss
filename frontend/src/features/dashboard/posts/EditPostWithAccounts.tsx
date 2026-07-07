
import { EditPostForm } from "./EditPostForm";
import { useAccountsForForm } from "../create/useAccountsForForm";
import { AccountsGridSkeleton } from "../create/AccountsGridSkeleton";
import type { PostForEdit } from "./post-types";
import type { PostMediaRow } from "./post-types";

type EditPostWithAccountsProps = {
  post: PostForEdit;
  existingMedia: PostMediaRow[];
  use24HourTimeFormat: boolean;
  dateFormat: string | null;
};

export function EditPostWithAccounts({
  post,
  existingMedia,
  use24HourTimeFormat,
  dateFormat,
}: EditPostWithAccountsProps) {
  const { accounts, loading } = useAccountsForForm(null);

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
