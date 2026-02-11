"use client";

import { PLATFORMS } from "@/lib/platforms";
import { useState } from "react";
import { BlueskyByokModal } from "./BlueskyByokModal";

type PlatformCardProps = {
  platform: (typeof PLATFORMS)[number];
  account?: {
    platformUsername: string | null;
    profileImageUrl: string | null;
    isActive: boolean;
  };
};

export function PlatformCard({ platform, account }: PlatformCardProps) {
  const isConnected = !!account;
  const [showBlueskyModal, setShowBlueskyModal] = useState(false);

  const handleConnect = () => {
    // Bluesky uses BYOK instead of OAuth
    if (platform.id === "bluesky") {
      setShowBlueskyModal(true);
      return;
    }

    // Use window.location for OAuth redirects to ensure full page navigation
    // This prevents any client-side routing issues
    window.location.href = `/api/connect/${platform.id}`;
  };

  return (
    <>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {platform.name}
        </h3>
        {isConnected ? (
          <div className="space-y-3">
            {account.profileImageUrl && (
              <img
                src={account.profileImageUrl}
                alt={platform.name}
                className="w-12 h-12 rounded-full mx-auto"
              />
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              Connected as{" "}
              <span className="font-medium">
                @{account.platformUsername || "user"}
              </span>
            </p>
            <button
              disabled
              className="w-full px-4 py-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-lg font-medium cursor-not-allowed"
            >
              Connected
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Connect
          </button>
        )}
      </div>
      {platform.id === "bluesky" && (
        <BlueskyByokModal
          isOpen={showBlueskyModal}
          onClose={() => setShowBlueskyModal(false)}
          onSuccess={(username) => {
            console.log("Connected as", username);
            setShowBlueskyModal(false);
          }}
        />
      )}
    </>
  );
}
