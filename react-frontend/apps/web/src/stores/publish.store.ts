import { create } from "zustand";
import type { JobProgressEvent } from "@/types";
import type { Platform } from "@/lib/platforms";

export type PlatformPublishState = {
  platform: Platform;
  connectedAccountId: string;
  phase: JobProgressEvent["phase"];
  message?: string;
};

interface PublishStore {
  trackingId: string | null;
  platforms: PlatformPublishState[];
  isPublishing: boolean;
  setTrackingId: (id: string | null) => void;
  setPublishing: (v: boolean) => void;
  updateFromEvent: (event: JobProgressEvent) => void;
  reset: () => void;
}

export const usePublishStore = create<PublishStore>((set, get) => ({
  trackingId: null,
  platforms: [],
  isPublishing: false,
  setTrackingId: (trackingId) => set({ trackingId }),
  setPublishing: (isPublishing) => set({ isPublishing }),
  updateFromEvent: (event) => {
    if (!event.platform || !event.connectedAccountId) return;
    const platforms = [...get().platforms];
    const idx = platforms.findIndex(
      (p) =>
        p.platform === event.platform &&
        p.connectedAccountId === event.connectedAccountId,
    );
    const next: PlatformPublishState = {
      platform: event.platform,
      connectedAccountId: event.connectedAccountId,
      phase: event.phase,
      message: event.message,
    };
    if (idx >= 0) platforms[idx] = next;
    else platforms.push(next);
    set({ platforms });
  },
  reset: () => set({ trackingId: null, platforms: [], isPublishing: false }),
}));
