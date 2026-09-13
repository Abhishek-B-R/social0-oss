export { POSTS_PAGE_SIZE } from "./posts-constants";
export type {
  PublicationRow,
  PostsListParams,
  StatusFilter,
} from "./posts-list-types";

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
