import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BulkToolsImageWithAccounts } from "@/features/dashboard/bulk-tools/BulkToolsImageWithAccounts";
import { CONTENT_TYPES } from "@/lib/content-types";
import { DOCS_BULK_TOOLS_IMAGE_URL } from "@/lib/docs-url";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { rpc } from "@/lib/rpc";

const IMAGE_PLATFORMS =
  CONTENT_TYPES.find((c) => c.id === "image")?.platforms ?? [];

export function BulkToolsImagePage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const { data: gate } = useQuery({
    queryKey: ["bulk-tools-gate"],
    queryFn: () => rpc<{ allowed: boolean }>("dashboard-data.checkBulkToolsGate"),
    enabled: !!session,
  });

  useEffect(() => {
    if (!isPending && !session) {
      navigate(signInUrl("/dashboard/bulk-tools/image"), { replace: true });
    }
  }, [isPending, session, navigate]);

  useEffect(() => {
    if (gate && !gate.allowed) {
      navigate("/dashboard/billing?upgrade=1", { replace: true });
    }
  }, [gate, navigate]);

  if (!session || !gate?.allowed) return null;

  return (
    <>
      <BulkToolsImageWithAccounts supportedPlatforms={Array.from(IMAGE_PLATFORMS)} />
      <a
        href={DOCS_BULK_TOOLS_IMAGE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-2 z-10 inline-flex items-center justify-center gap-2 rounded-full p-1.5 text-text-muted transition-colors touch-manipulation hover:bg-muted hover:text-text touch:h-11 touch:w-11 sm:right-6 lg:right-10"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </a>
    </>
  );
}
