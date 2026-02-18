"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function OAuthErrorHandler() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const platform = searchParams.get("platform");
  const connected = searchParams.get("connected");
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (error) {
      setShowError(true);
      switch (error) {
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
        case "no_pinterest_boards":
          setMessage("Create at least one board on Pinterest first.");
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
  }, [error, platform, connected]);

  if (!showError && !showSuccess) {
    return null;
  }

  return (
    <div className="mb-6">
      {showError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 font-medium">
          {message}
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
