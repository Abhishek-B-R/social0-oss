import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, HelpCircle } from "lucide-react";
import Link from "@/components/AppLink";
import {
  EmptyState,
  ErrorState,
  PageContainer,
  PageHeader,
  SkeletonCard,
  useDashboardBasePath,
  useDashboardPath,
} from "@/components/app";
import { LockedPlanPanel } from "@/features/dashboard/automations/LockedPlanPanel";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";
import { useSession } from "@/lib/auth-client";
import { DOCS_BULK_TOOLS_IMAGE_URL, DOCS_BULK_TOOLS_VIDEO_URL } from "@/lib/docs-url";
import { rpc } from "@/lib/rpc";
import { signInUrl } from "@/lib/sign-in-url";
import type { BulkImportScope } from "./bulk-import-model";
import { BulkImportWizard } from "./BulkImportWizard";

/**
 * Bulk import (`/bulk-tools`, `/bulk-tools/image`, `/bulk-tools/video`).
 * Plans without bulk tools see what it does and how to get it, not a
 * redirect to billing.
 */
export function BulkImportPage({ scope = "mixed" }: { scope?: BulkImportScope }) {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const dash = useDashboardPath();
  const base = useDashboardBasePath();
  const perms = useWorkspaceNavPermissions();

  // Signed-out visitors go to sign-in and come back here (as before).
  useEffect(() => {
    if (!isPending && !session) {
      navigate(signInUrl(`${location.pathname}${location.search}`), { replace: true });
    }
  }, [isPending, session, navigate, location.pathname, location.search]);

  const gate = useQuery({
    queryKey: ["bulk-tools-gate", base],
    queryFn: () => rpc<{ allowed: boolean }>("dashboard-data.checkBulkToolsGate"),
    enabled: !!session,
  });

  const docsUrl = scope === "image" ? DOCS_BULK_TOOLS_IMAGE_URL : DOCS_BULK_TOOLS_VIDEO_URL;
  const header = (
    <PageHeader
      breadcrumb={
        <Link href={dash("automations")} className="inline-flex items-center gap-1 hover:text-text">
          <ArrowLeft className="size-3" aria-hidden />
          Automations
        </Link>
      }
      title={scope === "image" ? "Bulk import images" : scope === "video" ? "Bulk import videos" : "Bulk import"}
      actions={
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
        >
          <HelpCircle className="size-4" aria-hidden />
          How it works
        </a>
      }
    />
  );

  if (!session) {
    return (
      <PageContainer>
        {header}
        <div aria-busy="true">
          <SkeletonCard lines={4} />
        </div>
      </PageContainer>
    );
  }

  if (gate.isError) {
    return (
      <PageContainer>
        {header}
        <ErrorState
          message="Couldn't check whether your plan includes bulk import."
          detail={gate.error instanceof Error ? gate.error.message : null}
          onRetry={() => void gate.refetch()}
          retrying={gate.isFetching}
        />
      </PageContainer>
    );
  }

  if (!gate.data) {
    return (
      <PageContainer>
        {header}
        <div aria-busy="true">
          <SkeletonCard lines={4} />
        </div>
      </PageContainer>
    );
  }

  if (!gate.data.allowed) {
    return (
      <PageContainer>
        {header}
        <LockedPlanPanel
          title="Import a month of posts in one go"
          description="Bulk import turns a folder of images or videos into scheduled posts, with captions and times from a spreadsheet."
          points={[
            "Up to 50 images or 40 videos per import",
            "Captions, YouTube titles and times from a CSV",
            "Every problem flagged before anything is posted",
            "Schedule, add to your queue, or save as drafts",
          ]}
        />
      </PageContainer>
    );
  }

  // The server checks create permission too; this only explains it early.
  if (perms.ready && !perms.canCreatePosts) {
    return (
      <PageContainer>
        {header}
        <EmptyState
          title="Your role can't create posts here"
          description="Ask a workspace admin to change your role if you need to import posts."
          secondaryAction={{ label: "Go to posts", href: dash("posts") }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {header}
      <BulkImportWizard scope={scope} />
    </PageContainer>
  );
}

export default BulkImportPage;
