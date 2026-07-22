export type TikTokPostSettings = {
  privacy_level: string;
  video_title: string;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
  brand_content_toggle: boolean;
  brand_organic: boolean;
  brand_content: boolean;
  post_as_draft: boolean;
  mark_ai_generated: boolean;
  tiktok_post_consent: boolean;
};

export const DEFAULT_TIKTOK_POST_SETTINGS: TikTokPostSettings = {
  privacy_level: "PUBLIC_TO_EVERYONE",
  video_title: "",
  disable_comment: false,
  disable_duet: false,
  disable_stitch: false,
  brand_content_toggle: false,
  brand_organic: false,
  brand_content: false,
  post_as_draft: false,
  mark_ai_generated: false,
  tiktok_post_consent: true,
};
