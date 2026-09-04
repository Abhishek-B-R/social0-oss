import Link from "@/components/AppLink";
import { Video, ImageIcon, Layers } from "lucide-react";
import { getPlatformIcon } from "@/lib/platform-icons";
import { CONTENT_TYPES } from "@/lib/content-types";
import { useDashboardPath } from "@/lib/dashboard-base-path";

const VIDEO_PLATFORMS =
  CONTENT_TYPES.find((c) => c.id === "video")?.platforms ?? [];
const IMAGE_PLATFORMS =
  CONTENT_TYPES.find((c) => c.id === "image")?.platforms ?? [];

const PLATFORM_DISPLAY: Record<string, { name: string; color: string }> = {
  linkedin: { name: "LinkedIn", color: "bg-[#0A66C2]" },
  facebook: { name: "Facebook", color: "bg-[#1877F2]" },
  bluesky: { name: "Bluesky", color: "bg-[#0085FF]" },
  youtube: { name: "YouTube", color: "bg-[#FF0000]" },
  pinterest: { name: "Pinterest", color: "bg-[#E60023]" },
  instagram: {
    name: "Instagram",
    color: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  },
  tiktok: { name: "TikTok", color: "bg-[#000000]" },
  twitter_x: { name: "X", color: "bg-[#000000]" },
  threads: { name: "Threads", color: "bg-[#000000]" },
};

function PlatformIcons({ platformIds }: { platformIds: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {platformIds.map((platformId) => {
        const p = PLATFORM_DISPLAY[platformId];
        const Icon = getPlatformIcon(platformId);
        if (!p || !Icon) return null;
        return (
          <span
            key={platformId}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${p.color} text-white shadow-sm`}
            title={p.name}
          >
            <Icon className="h-4 w-4" />
          </span>
        );
      })}
    </div>
  );
}

export default function BulkToolsPage() {
  const dash = useDashboardPath();
  return (
    <div>
      <h1 className="mb-2 dash-page-title">
        Bulk tools
      </h1>
      <p className="mt-2 text-text-muted">
        Upload and schedule multiple videos or images at once.
      </p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        <Link
          href={dash("bulk-tools/video")}
          className="group flex flex-col rounded-2xl border-2 border-border bg-bg-elevated p-6 shadow-sm transition-colors hover:bg-accent/10 hover:border-accent"
        >
          <div className="flex items-center justify-center gap-2 text-text-muted group-hover:text-accent mb-3">
            <Layers className="h-8 w-8" />
            <Video className="h-8 w-8" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="mb-2 font-logo text-[1.75rem] font-normal tracking-tight text-foreground sm:text-[2.15rem] sm:leading-tight">
              Bulk Video Upload
            </h2>
            <span className="rounded-md bg-bg-muted px-2 py-0.5 text-xs font-medium text-text">
              NEW
            </span>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Upload and schedule multiple videos at once.
          </p>
          <PlatformIcons platformIds={VIDEO_PLATFORMS} />
        </Link>

        <Link
          href={dash("bulk-tools/image")}
          className="group flex flex-col rounded-2xl border-2 border-border bg-bg-elevated p-6 shadow-sm transition-colors hover:bg-accent/10 hover:border-accent"
        >
          <div className="flex items-center justify-center gap-2 text-text-muted group-hover:text-accent mb-3">
            <Layers className="h-8 w-8" />
            <ImageIcon className="h-8 w-8" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="mb-2 font-logo text-[1.75rem] font-normal tracking-tight text-foreground sm:text-[2.15rem] sm:leading-tight">
              Bulk Image Upload
            </h2>
            <span className="rounded-md bg-bg-muted px-2 py-0.5 text-xs font-medium text-text">
              NEW
            </span>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Upload and schedule multiple images at once.
          </p>
          <PlatformIcons platformIds={IMAGE_PLATFORMS} />
        </Link>
      </div>
    </div>
  );
}
