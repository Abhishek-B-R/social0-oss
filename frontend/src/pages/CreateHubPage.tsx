import { NewPostTypeSelector } from "@/features/dashboard/create/NewPostTypeSelector";

export function CreateHubPage() {
  return (
    <div className="px-10">
      <h2 className="mb-2 font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
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
