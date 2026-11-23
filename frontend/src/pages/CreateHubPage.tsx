import { NewPostPage } from "@/features/dashboard/create/NewPostPage";

/**
 * Old `/dashboard/create` ("Do it manually") type picker. The post type is
 * now detected from content, so this opens the composer directly.
 */
export function CreateHubPage() {
  return <NewPostPage />;
}
