
import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { PRE_CONNECT } from "@/lib/preconnect";
import { BlueskyByokModal } from "@/components/BlueskyByokModal";
import { PreConnectModal } from "@/components/PreConnectModal";
import { InstagramConnectionModal } from "@/components/InstagramConnectionModal";
import { signInUrl } from "@/lib/sign-in-url";
import { sanitizeReturnToPath } from "@/lib/safe-return-to";
import { apiUrl } from "@/lib/env";

type Platform = (typeof PLATFORMS)[number];

function connectUrl(platformId: string, returnTo?: string | null): string {
  const base = apiUrl(`/api/connect/${platformId}`);
  const safe = sanitizeReturnToPath(returnTo);
  if (safe) {
    return `${base}?returnTo=${encodeURIComponent(safe)}`;
  }
  return base;
}

export function ConnectPlatformButton({
  platform,
  size = "default",
  className,
  returnTo,
  disabled = false,
  onDisabledClick,
  requireAuth = false,
}: {
  platform: Platform;
  size?: "default" | "sm";
  className?: string;
  /** After OAuth success, redirect here instead of dashboard (e.g. /onboarding/step3) */
  returnTo?: string | null;
  /** When true, button is disabled (e.g. plan account limit reached) */
  disabled?: boolean;
  /** Called when user clicks a disabled button, e.g. to show a plan-limit toast */
  onDisabledClick?: () => void;
  /** When true, redirect to sign-in instead of starting OAuth */
  requireAuth?: boolean;
}) {
  const [showBlueskyModal, setShowBlueskyModal] = useState(false);
  const [showPreConnectModal, setShowPreConnectModal] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const preConnect = PRE_CONNECT[platform.id];
  const isNativeDisabled = isLoading || (disabled && !onDisabledClick);

  const handleConnect = () => {
    if (requireAuth) {
      const callback =
        sanitizeReturnToPath(returnTo) ?? "/dashboard/connections";
      window.location.href = signInUrl(callback);
      return;
    }
    if (disabled) {
      onDisabledClick?.();
      return;
    }
    if (platform.id === "bluesky") {
      setShowBlueskyModal(true);
      return;
    }
    if (platform.id === "instagram") {
      setShowInstagramModal(true);
      return;
    }
    if (preConnect) {
      setShowPreConnectModal(true);
      return;
    }
    setIsLoading(true);
    window.location.href = connectUrl(platform.id, returnTo);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleConnect}
        disabled={isNativeDisabled}
        aria-label={`Connect ${platform.name}`}
        className={`shrink-0 rounded-lg border border-border bg-white font-semibold text-text shadow-sm transition-colors dark:bg-bg-elevated ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : isLoading
              ? "cursor-wait opacity-75"
              : "hover:bg-bg-subtle"
        } ${
          size === "sm" ? "flex h-8 w-8 items-center justify-center p-0 sm:h-auto sm:w-auto sm:px-2 sm:py-1 text-xs" : "rounded-xl px-4 py-2 text-sm"
        } ${className ?? ""}`}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Plus className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">Connect</span>
          </>
        )}
      </button>
      {preConnect && (
        <PreConnectModal
          isOpen={showPreConnectModal}
          onClose={() => setShowPreConnectModal(false)}
          onContinue={() => {
            setShowPreConnectModal(false);
            window.location.href = connectUrl(platform.id, returnTo);
          }}
          title={preConnect.title}
          checkmark={preConnect.checkmark}
          info={preConnect.info}
        />
      )}
      {platform.id === "bluesky" && (
        <BlueskyByokModal
          isOpen={showBlueskyModal}
          onClose={() => setShowBlueskyModal(false)}
          onSuccess={() => setShowBlueskyModal(false)}
        />
      )}
      {platform.id === "instagram" && (
        <InstagramConnectionModal
          isOpen={showInstagramModal}
          onClose={() => setShowInstagramModal(false)}
          onSelectDirect={() => {
            setShowInstagramModal(false);
            window.location.href = connectUrl("instagram", returnTo);
          }}
          onSelectFacebookPage={() => {
            setShowInstagramModal(false);
            const safe = sanitizeReturnToPath(returnTo);
            window.location.href = safe
              ? apiUrl(
                  `/api/connect/instagram-facebook?returnTo=${encodeURIComponent(safe)}`,
                )
              : apiUrl("/api/connect/instagram-facebook");
          }}
        />
      )}
    </>
  );
}
