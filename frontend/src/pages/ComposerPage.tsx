import { Composer } from "@/features/dashboard/composer/Composer";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";

export function ComposerPage() {
  const { ready, canCreatePosts } = useWorkspaceNavPermissions();

  if (!ready) {
    return (
      <div className="relative px-4 sm:px-6 lg:px-10" aria-busy>
        <div className="h-[28rem] animate-pulse rounded-xl bg-bg-muted" />
      </div>
    );
  }

  if (!canCreatePosts) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-elevated px-6 text-center">
        <p className="text-sm font-medium text-text">
          Publishing is not in your role
        </p>
        <p className="mt-1 max-w-sm text-sm text-text-muted">
          Ask a team admin to switch you to Member or Admin if you need to
          create posts.
        </p>
      </div>
    );
  }

  return (
    <div className="relative px-4 sm:px-6 lg:px-10">
      <Composer />
    </div>
  );
}
