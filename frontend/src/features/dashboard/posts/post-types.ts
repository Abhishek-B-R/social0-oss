export {
  POSTS_PAGE_SIZE,
  type PublicationRow,
  type PostsListParams,
  type StatusFilter,
} from "@social0/shared";

export type PostForEdit = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: Date | null;
  mediaIds: string[] | null;
  connectedAccountIds: string[];
};

export type PostMediaRow = {
  id: string;
  originalFilename: string;
  mimeType: string;
  url: string | null;
  thumbnailUrl: string | null;
};

export type PostDetailRow = {
  id: string;
  originalContent: string | null;
  status: string | null;
  scheduledAt: Date | null;
  createdAt: Date | null;
  mediaIds: string[] | null;
  metadata: Record<string, unknown> | null;
  failureReason: string | null;
};

export type QueuedSlotInfo = {
  slotId: string;
  scheduledFor: Date;
};

export type ResurfaceDetail = {
  id: string;
  isActive: boolean;
  resurfacesDone: number;
  maxResurfaces: number;
  intervalHours: number;
  plugComment: string | null;
};

export type AutoPlugDetail = {
  id: string;
  status: string;
  metricType: string;
  metricThreshold: number;
  plugComment: string;
};

export type PostDetailResult = {
  post: PostDetailRow;
  publications: import("@social0/shared").PublicationRow[];
  queuedSlot: QueuedSlotInfo | null;
  autoPlug: AutoPlugDetail | null;
  resurface: ResurfaceDetail | null;
};
