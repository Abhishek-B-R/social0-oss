
import { BulkToolsImage } from "@/components/bulk-tools/BulkToolsImage";
import { useAccountsForForm } from "@/features/dashboard/create/useAccountsForForm";

export function BulkToolsImageWithAccounts({
  supportedPlatforms,
}: {
  supportedPlatforms: string[];
}) {
  const { accounts, loading } = useAccountsForForm(supportedPlatforms);

  if (loading) {
    return (
      <BulkToolsImage
        accounts={[]}
        accountsLoading={true}
        supportedPlatforms={supportedPlatforms}
      />
    );
  }

  return (
    <BulkToolsImage
      accounts={accounts}
      supportedPlatforms={supportedPlatforms}
    />
  );
}
