import { NewPostTypeSelector } from "@/features/dashboard/create/NewPostTypeSelector";

export function CreateHubPage() {
  return (
    <div className="px-10">
      <h2 className="mb-2 dash-page-title">
        Do it manually
      </h2>
      <p className="text-text-muted mb-8 font-medium">
        Select your preferred content type below and we&apos;ll take you to the
        right form.
      </p>
      <NewPostTypeSelector />
    </div>
  );
}
