"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

export function OAuthErrorHandler({
  hasUsedTrial = false,
}: {
  /** When true, show upgrade message; when false, show start-trial message. Used when error is limit_reached and no message in URL. */
  hasUsedTrial?: boolean;
} = {}) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const messageParam = searchParams.get("message");
  const platform = searchParams.get("platform");
  const connected = searchParams.get("connected");
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowError(true);
      switch (error) {
        case "limit":
        case "limit_reached":
          setMessage(
            messageParam
              ? decodeURIComponent(messageParam)
              : "You've reached your account limit. Upgrade to connect more accounts.",
          );
          break;
        case "oauth_failed":
          setMessage(`Failed to connect ${platform || "account"}`);
          break;
        case "invalid_callback":
          setMessage("Invalid OAuth callback");
          break;
        case "state_mismatch":
          setMessage("Security validation failed");
          break;
        case "invalid_state":
          setMessage("Invalid OAuth state");
          break;
        case "platform_not_configured":
          setMessage(`${platform || "Platform"} is not configured`);
          break;
        case "credentials_not_configured":
          setMessage("OAuth credentials not configured");
          break;
        case "no_facebook_pages":
          setMessage("No Facebook Pages found. You need a Page to connect.");
          break;
        case "rate_limited":
          setMessage(
            "Too many connect attempts in a short time. Wait a few minutes, then try again.",
          );
          break;
        case "oauth_session_mismatch":
          setMessage(
            "Connection session expired. Please click Connect again while logged in to the same browser.",
          );
          break;
        case "tiktok_scope_required":
          setMessage(
            "TikTok did not grant profile access (user.info.basic). In the TikTok app go to Settings → Security → Manage app permissions, remove Social0, then click Connect here again and approve all permissions.",
          );
          break;
        case "tiktok_profile_failed":
          setMessage(
            "Could not load your TikTok profile. Remove Social0 from TikTok app permissions (Settings → Security → Manage app permissions), then Connect again.",
          );
          break;
        default:
          setMessage("An error occurred during connection");
      }
      // Auto-hide after 5 seconds
      setTimeout(() => setShowError(false), 5000);
    }

    if (connected) {
      setShowSuccess(true);
      setMessage(`Successfully connected ${connected}!`);
      // Auto-hide after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
    }
  }, [error, messageParam, platform, connected, hasUsedTrial]);

  if (!showError && !showSuccess) {
    return null;
  }

  return (
    <div className="mb-6">
      {showError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 font-medium dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {message}
          {(error === "limit" || error === "limit_reached") && (
            <>
              {" "}
              Click{" "}
              <Link
                href="/dashboard/billing"
                className="font-semibold underline underline-offset-2 hover:no-underline"
              >
                Billing
              </Link>{" "}
              to upgrade.
            </>
          )}
        </div>
      )}
      {showSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 font-medium">
          {message}
        </div>
      )}
    </div>
  );
}
