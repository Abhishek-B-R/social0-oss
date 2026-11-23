import { BulkImportPage } from "@/features/dashboard/bulk-tools/BulkImportPage";

/** `/bulk-tools/video`: the bulk import wizard limited to videos. */
export function BulkToolsVideoPage() {
  return <BulkImportPage scope="video" />;
}
