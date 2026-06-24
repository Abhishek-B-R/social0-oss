"use client";

import { BulkToolsImageClient } from "@/components/bulk-tools/BulkToolsImageClient";
import { useAccountsForForm } from "@/features/dashboard/create/useAccountsForForm";

export function BulkToolsImageWithAccounts({
  supportedPlatforms,
}: {
  supportedPlatforms: string[];
}) {
  const { accounts, loading } = useAccountsForForm(supportedPlatforms);

  if (loading) {
    return (
      <BulkToolsImageClient
        accounts={[]}
        accountsLoading={true}
        supportedPlatforms={supportedPlatforms}
      />
    );
  }

  return (
    <BulkToolsImageClient
      accounts={accounts}
      supportedPlatforms={supportedPlatforms}
    />
  );
}
