
import { BulkToolsVideo } from "@/components/bulk-tools/BulkToolsVideo";
import { useAccountsForForm } from "@/features/dashboard/create/useAccountsForForm";

export function BulkToolsVideoWithAccounts({
  supportedPlatforms,
}: {
  supportedPlatforms: string[];
}) {
  const { accounts, loading } = useAccountsForForm(supportedPlatforms);

  if (loading) {
    return (
      <BulkToolsVideo
        accounts={[]}
        accountsLoading={true}
        supportedPlatforms={supportedPlatforms}
      />
    );
  }

  return (
    <BulkToolsVideo
      accounts={accounts}
      supportedPlatforms={supportedPlatforms}
    />
  );
}
