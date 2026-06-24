export type AutoPlugConfig = {
  metricType: "likes" | "retweets";
  threshold: number;
  plugComment: string;
};

export type AutoResurfaceConfig = {
  intervalHours: number;
  maxResurfaces: number;
  plugComment: string;
};
