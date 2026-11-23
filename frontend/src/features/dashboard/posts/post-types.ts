/** Post detail / composer types shared with `api/posts.ts`. */
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
