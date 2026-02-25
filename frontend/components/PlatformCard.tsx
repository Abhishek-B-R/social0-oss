"use client";

import { PLATFORMS } from "@/lib/platforms";
import { useState } from "react";
import { AccountAvatar } from "./AccountAvatar";
import { BlueskyByokModal } from "./BlueskyByokModal";
import { DevToByokModal } from "./DevToByokModal";
import { HashnodeByokModal } from "./HashnodeByokModal";
import { PreConnectModal } from "./PreConnectModal";
import { InstagramConnectionModal } from "./InstagramConnectionModal";

type PlatformCardProps = {
  platform: (typeof PLATFORMS)[number];
  account?: {
    platformUsername: string | null;
    profileImageUrl: string | null;
    isActive: boolean;
  };
};

const PRE_CONNECT: Record<string, { title: string; checkmark: string; info: string }> = {
  facebook: {
    title: "Connect Facebook Page",
    checkmark: "Must be a Facebook Page",
    info: "Social0 only supports connecting Facebook Pages. Personal profiles and Groups are not supported.",
  },
  instagram: {
    title: "Connect Instagram",
    checkmark: "Must be a Business or Creator account",
    info: "Personal Instagram accounts are not supported. Your account must be connected to a Facebook Page.",
  },
  youtube: {
    title: "Connect YouTube",
    checkmark: "Must have a YouTube channel",
    info: "A Google account alone is not enough — you need an active YouTube channel to upload content.",
  },
};

export function PlatformCard({ platform, account }: PlatformCardProps) {
  const isConnected = !!account;
  const [showBlueskyModal, setShowBlueskyModal] = useState(false);
  const [showDevToModal, setShowDevToModal] = useState(false);
  const [showHashnodeModal, setShowHashnodeModal] = useState(false);
  const [showPreConnectModal, setShowPreConnectModal] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);

  const preConnect = PRE_CONNECT[platform.id];

  const handleConnect = () => {
    if (platform.id === "bluesky") {
      setShowBlueskyModal(true);
      return;
    }
    if (platform.id === "devto") {
      setShowDevToModal(true);
      return;
    }
    if (platform.id === "hashnode") {
      setShowHashnodeModal(true);
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
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {platform.name}
        </h3>
        {isConnected ? (
          <div className="space-y-3">
            <div className="flex justify-center">
              <AccountAvatar
                profileImageUrl={account.profileImageUrl}
                username={account.platformUsername}
                platform={platform.id}
                size="lg"
              />
            </div>
            <p className="text-sm text-gray-600 text-center">
              Connected as{" "}
              <span className="font-medium text-gray-900">
                @{account.platformUsername || "user"}
              </span>
            </p>
            <button
              disabled
              className="w-full rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2.5 font-semibold cursor-default"
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
      {platform.id === "devto" && (
        <DevToByokModal
          isOpen={showDevToModal}
          onClose={() => setShowDevToModal(false)}
          onSuccess={() => setShowDevToModal(false)}
        />
      )}
      {platform.id === "hashnode" && (
        <HashnodeByokModal
          isOpen={showHashnodeModal}
          onClose={() => setShowHashnodeModal(false)}
          onSuccess={() => setShowHashnodeModal(false)}
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
