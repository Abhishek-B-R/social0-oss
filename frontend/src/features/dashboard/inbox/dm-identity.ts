import type { InboxDmThread } from "@/api/inbox";

const WEAK_DM_PEER_NAMES = new Set([
  "Unknown",
  "X user",
  "Bluesky user",
  "Conversation",
  "TikTok user",
]);

export function isWeakDmPeerName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true;
  return WEAK_DM_PEER_NAMES.has(name.trim());
}

/** Prefer non-placeholder name/handle/avatar when merging list + thread identity. */
export function mergeDmThreadIdentity(
  preferred: InboxDmThread,
  fallback?: InboxDmThread | null,
): InboxDmThread {
  if (!fallback) return preferred;
  const useFallbackName =
    isWeakDmPeerName(preferred.peerName) && !isWeakDmPeerName(fallback.peerName);
  const useFallbackHandle =
    !preferred.peerHandle?.trim() && Boolean(fallback.peerHandle?.trim());
  const useFallbackAvatar =
    !preferred.peerAvatarUrl?.trim() && Boolean(fallback.peerAvatarUrl?.trim());
  const useFallbackPeerId = !preferred.peerId && Boolean(fallback.peerId);
  return {
    ...fallback,
    ...preferred,
    peerId: useFallbackPeerId ? fallback.peerId : preferred.peerId || fallback.peerId,
    peerName: useFallbackName ? fallback.peerName : preferred.peerName,
    peerHandle: useFallbackHandle ? fallback.peerHandle : preferred.peerHandle,
    peerAvatarUrl: useFallbackAvatar
      ? fallback.peerAvatarUrl
      : preferred.peerAvatarUrl ?? fallback.peerAvatarUrl,
  };
}

/** Visible @handle when it adds information beyond the display name. */
export function dmPeerHandleLabel(
  peerName: string,
  peerHandle: string | null | undefined,
): string | null {
  if (!peerHandle?.trim()) return null;
  const handle = peerHandle.replace(/^@/, "").trim();
  if (!handle) return null;
  const name = peerName.replace(/^@/, "").trim().toLowerCase();
  if (name && name === handle.toLowerCase()) return null;
  return handle;
}
