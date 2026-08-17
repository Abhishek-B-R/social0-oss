import { rpc } from "@/lib/rpc";

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
  authorName: string;
  authorHandle: string | null;
  text: string;
  createdAt: string | null;
  likeCount?: number;
  parentId: string | null;
  canReply: boolean;
};

export type InboxThread = {
  comment: InboxComment;
  replies: InboxComment[];
};

export type InboxListResult = {
  threads: InboxThread[];
  accountsNeedingReconnect: Array<{
    accountId: string;
    platform: string;
    username: string | null;
    missingScopes: string[];
  }>;
  unsupported: string[];
  fetchedAt: string;
  sampled: boolean;
  sampleLimit: number;
};

export function listInboxComments(input?: {
  accountId?: string | null;
  platform?: string | null;
}): Promise<InboxListResult> {
  return rpc<InboxListResult>("inbox.listComments", input ?? {});
}

export function replyToInboxComment(input: {
  publicationId: string;
  commentId: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return rpc("inbox.replyToComment", input);
}
