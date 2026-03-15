"use client";

import { BulkToolsImageClient } from "@/components/bulk-tools/BulkToolsImageClient";
import { useAccountsForForm } from "@/app/dashboard/create/useAccountsForForm";

export function BulkToolsImageWithAccounts({
  supportedPlatforms,
}: {
  supportedPlatforms: string[];
}) {
  const { accounts, loading, error } = useAccountsForForm(supportedPlatforms);

  if (loading) {
    return (
      <BulkToolsImageClient
        accounts={[]}
        accountsLoading={true}
        supportedPlatforms={supportedPlatforms}
      />
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
    <BulkToolsImageClient
      accounts={accounts}
      supportedPlatforms={supportedPlatforms}
    />
  );
}
