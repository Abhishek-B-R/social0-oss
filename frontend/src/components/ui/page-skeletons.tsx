import { PageHeader } from "@/components/app";
import { SkeletonBone } from "@/components/ui/skeleton-bone";

export function FeedbackPageSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      aria-busy="true"
      aria-label="Loading feedback"
    >
      <PageHeader title="Feedback" />
      <div className="flex-1 space-y-3">
        <div className="flex flex-wrap gap-2">
          <SkeletonBone className="h-9 w-28 rounded-lg" />
          <SkeletonBone className="h-9 w-24 rounded-lg" />
          <SkeletonBone className="h-9 w-20 rounded-lg" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-bg-elevated p-4"
          >
            <div className="flex gap-3">
              <SkeletonBone className="h-12 w-10 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBone className="h-4 w-[70%]" />
                <SkeletonBone className="h-3 w-full" />
                <SkeletonBone className="h-3 w-[40%]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
