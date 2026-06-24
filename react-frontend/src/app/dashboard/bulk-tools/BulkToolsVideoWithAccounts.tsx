"use client";

import { BulkToolsVideoClient } from "@/components/bulk-tools/BulkToolsVideoClient";
import { useAccountsForForm } from "@/app/dashboard/create/useAccountsForForm";

export function BulkToolsVideoWithAccounts({
  supportedPlatforms,
}: {
  supportedPlatforms: string[];
}) {
  const { accounts, loading } = useAccountsForForm(supportedPlatforms);

  if (loading) {
    return (
      <BulkToolsVideoClient
        accounts={[]}
        accountsLoading={true}
        supportedPlatforms={supportedPlatforms}
      />
    );
  }

  return (
    <BulkToolsVideoClient
      accounts={accounts}
      supportedPlatforms={supportedPlatforms}
    />
  );
}
