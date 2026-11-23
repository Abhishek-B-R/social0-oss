import { BulkImportPage } from "@/features/dashboard/bulk-tools/BulkImportPage";

/** `/bulk-tools/image`: the bulk import wizard limited to images. */
export function BulkToolsImagePage() {
  return <BulkImportPage scope="image" />;
}
