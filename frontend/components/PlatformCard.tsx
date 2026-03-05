"use client";

import { PLATFORMS } from "@/lib/platforms";
import { PRE_CONNECT } from "@/lib/preconnect";
import { useState } from "react";
import { AccountAvatar } from "./AccountAvatar";
import { BlueskyByokModal } from "./BlueskyByokModal";
import { PreConnectModal } from "./PreConnectModal";
import { InstagramConnectionModal } from "./InstagramConnectionModal";

type PlatformCardProps = {
  platform: (typeof PLATFORMS)[number];
  account?: {
    platformUsername: string | null;
    profileImageUrl: string | null;
    isActive: boolean;
    isTwitterPremium?: boolean;
  };
};

export function PlatformCard({ platform, account }: PlatformCardProps) {
  const isConnected = !!account;
  const [showBlueskyModal, setShowBlueskyModal] = useState(false);
  const [showPreConnectModal, setShowPreConnectModal] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);

  const preConnect = PRE_CONNECT[platform.id];

  const handleConnect = () => {
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
    window.location.href = `/api/connect/${platform.id}`;
  };

  const handlePreConnectContinue = () => {
    setShowPreConnectModal(false);
    window.location.href = `/api/connect/${platform.id}`;
  };

  const handleInstagramDirect = () => {
    setShowInstagramModal(false);
    window.location.href = `/api/connect/instagram`;
  };

  const handleInstagramFacebookPage = () => {
    setShowInstagramModal(false);
    window.location.href = `/api/connect/instagram-facebook`;
  };

  return (
    <>
      <div className="rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm hover:shadow-md transition-shadow">
        <h3 className="text-lg font-semibold text-text mb-4">
          {platform.name}
        </h3>
        {isConnected ? (
          <div className="space-y-3">
            <div className="flex justify-center">
              <AccountAvatar
                profileImageUrl={account.profileImageUrl}
                username={account.platformUsername}
                platform={platform.id}
                isTwitterPremium={account.isTwitterPremium ?? false}
                size="lg"
              />
            </div>
            <p className="text-sm text-text-muted text-center">
              Connected as{" "}
              <span className="font-medium text-text">
                @{account.platformUsername || "user"}
              </span>
            </p>
            <button
              disabled
              className="w-full rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-4 py-2.5 font-semibold cursor-default"
            >
              Connected
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 font-semibold shadow-md transition-colors"
          >
            Connect
          </button>
        )}
      </div>

      {preConnect && (
        <PreConnectModal
          isOpen={showPreConnectModal}
          onClose={() => setShowPreConnectModal(false)}
          onContinue={handlePreConnectContinue}
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
          onSelectDirect={handleInstagramDirect}
          onSelectFacebookPage={handleInstagramFacebookPage}
        />
      )}
    </>
  );
}
