import { rpc } from "@/lib/rpc";
import type { DateWindowRange } from "@/lib/date-window";

export type InboxRange = DateWindowRange;

export type InboxAttachment = {
  type: "image" | "video";
  url: string;
  thumbnailUrl?: string | null;
};

export type InboxComment = {
  id: string;
  platform: string;
  accountId: string;
  accountLabel: string | null;
  postId: string;
  publicationId: string;
  platformPostId: string;
  platformPostUrl: string | null;
  postSnippet: string;
  postContent: string;
  postMediaUrl?: string | null;
  postPublishedAt?: string | null;
  postAccountImageUrl?: string | null;
  authorName: string;
  authorHandle: string | null;
  authorAvatarUrl?: string | null;
  text: string;
  attachment?: InboxAttachment | null;
  createdAt: string | null;
  likeCount?: number;
  parentId: string | null;
  canReply: boolean;
  isOwn?: boolean;
};

export type InboxThread = {
  comment: InboxComment;
  replies: InboxComment[];
};

export type InboxReconnectHint = {
  accountId: string;
  platform: string;
  username: string | null;
  missingScopes: string[];
};

export type InboxFetchError = {
  accountId: string;
  platform: string;
  error: string;
};

export type InboxNotice = {
  platform: string;
  message: string;
};

export type InboxListResult = {
  range: InboxRange;
  since: string;
  until: string;
  threads: InboxThread[];
  accountsNeedingReconnect: InboxReconnectHint[];
  unsupported: string[];
  fetchErrors: InboxFetchError[];
  notices?: InboxNotice[];
  fetchedAt: string;
  sampled: boolean;
  sampleLimit: number;
  hasMore?: boolean;
  nextBefore?: string | null;
};

export type InboxDmThread = {
  conversationId: string;
  platform: string;
  accountId: string;
  accountLabel: string | null;
  accountProfileImageUrl?: string | null;
  peerId: string;
  peerName: string;
  peerHandle: string | null;
  peerAvatarUrl?: string | null;
  lastMessageAt: string | null;
  snippet: string;
  canReply: boolean;
  mediaKinds?: ("image" | "video")[];
};

export type InboxDmMessage = {
  id: string;
  text: string;
  createdAt: string | null;
  isOwn: boolean;
  authorName: string;
  authorHandle: string | null;
  authorAvatarUrl?: string | null;
  attachment?: InboxAttachment | null;
};

/** Client-only fields for optimistic / failed sends. */
export type LocalInboxDmMessage = InboxDmMessage & {
  sendStatus?: "sending" | "failed";
  localPreviewUrl?: string | null;
  retryPayload?: {
    text: string;
    mediaId?: string;
    file?: File;
    previewUrl?: string | null;
  };
};

export type InboxDmListResult = {
  range: InboxRange;
  since: string;
  until: string;
  threads: InboxDmThread[];
  accountsNeedingReconnect: InboxReconnectHint[];
  unsupported: string[];
  fetchErrors: InboxFetchError[];
  notices?: InboxNotice[];
  fetchedAt: string;
  sampled: boolean;
  sampleLimit: number;
  hasMore?: boolean;
  nextBefore?: string | null;
};

export type InboxAccount = {
  id: string;
  platform: string;
  username: string | null;
  profileImageUrl: string | null;
  missingScopes: string[];
};

export type InboxDmThreadResult = {
  conversationId: string;
  thread: InboxDmThread;
  messages: InboxDmMessage[];
  fetchedAt: string;
};

export function listInboxComments(input?: {
  accountId?: string | null;
  platform?: string | null;
  range?: InboxRange;
  since?: string;
  until?: string;
  before?: string;
  limit?: number;
  fresh?: boolean;
}): Promise<InboxListResult> {
  return rpc<InboxListResult>("inbox.listComments", input ?? {});
}

export function replyToInboxComment(input: {
  publicationId: string;
  commentId: string;
  text: string;
  mediaId?: string;
}): Promise<{ ok: true; replyId?: string } | { ok: false; error: string }> {
  return rpc("inbox.replyToComment", input);
}

export function likeInboxComment(input: {
  publicationId: string;
  commentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return rpc("inbox.likeComment", input);
}

export function listInboxDms(input?: {
  accountId?: string | null;
  range?: InboxRange;
  since?: string;
  until?: string;
  before?: string;
  limit?: number;
  fresh?: boolean;
}): Promise<InboxDmListResult> {
  return rpc<InboxDmListResult>("inbox.listDms", input ?? {});
}

export function getInboxDmThread(input: {
  accountId: string;
  conversationId: string;
  peerId?: string;
  fresh?: boolean;
}): Promise<InboxDmThreadResult | { error: string }> {
  return rpc<InboxDmThreadResult | { error: string }>("inbox.getDmThread", input);
}

export function listInboxAccounts(input?: {
  mode?: "comments" | "dms";
}): Promise<InboxAccount[]> {
  return rpc<InboxAccount[]>("inbox.listAccounts", input ?? {});
}

export function replyToInboxDm(input: {
  accountId: string;
  conversationId: string;
  peerId: string;
  text: string;
  mediaId?: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  return rpc("inbox.replyToDm", input);
}
