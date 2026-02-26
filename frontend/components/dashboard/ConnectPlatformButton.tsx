"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PLATFORMS } from "@/lib/platforms";
import { BlueskyByokModal } from "@/components/BlueskyByokModal";
import { DevToByokModal } from "@/components/DevToByokModal";
import { HashnodeByokModal } from "@/components/HashnodeByokModal";
import { PreConnectModal } from "@/components/PreConnectModal";
import { InstagramConnectionModal } from "@/components/InstagramConnectionModal";

type Platform = (typeof PLATFORMS)[number];

const PRE_CONNECT: Record<
  string,
  { title: string; checkmark: string; info: string }
> = {
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

export function ConnectPlatformButton({
  platform,
  size = "default",
  className,
}: {
  platform: Platform;
  size?: "default" | "sm";
  className?: string;
}) {
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

  return (
    <>
      <button
        type="button"
        onClick={handleConnect}
        aria-label={`Connect ${platform.name}`}
        className={`shrink-0 rounded-lg border border-border bg-bg font-semibold text-text shadow-sm hover:bg-bg-subtle transition-colors ${
          size === "sm" ? "flex h-8 w-8 items-center justify-center p-0 sm:h-auto sm:w-auto sm:px-2 sm:py-1 text-xs" : "rounded-xl px-4 py-2 text-sm"
        } ${className ?? ""}`}
      >
        <Plus className="h-4 w-4 sm:hidden" />
        <span className="hidden sm:inline">Connect</span>
      </button>
      {preConnect && (
        <PreConnectModal
          isOpen={showPreConnectModal}
          onClose={() => setShowPreConnectModal(false)}
          onContinue={() => {
            setShowPreConnectModal(false);
            window.location.href = `/api/connect/${platform.id}`;
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
          onSelectDirect={() => {
            setShowInstagramModal(false);
            window.location.href = "/api/connect/instagram";
          }}
          onSelectFacebookPage={() => {
            setShowInstagramModal(false);
            window.location.href = "/api/connect/instagram-facebook";
          }}
        />
      )}
    </>
  );
}
