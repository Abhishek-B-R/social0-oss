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
              : hasUsedTrial
                ? "Upgrade to a plan to connect accounts and start posting."
                : "Start your 7-day free trial to connect accounts and start posting.",
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
            "You have reached the rate limit for this platform. Please try again after a few minutes.",
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
