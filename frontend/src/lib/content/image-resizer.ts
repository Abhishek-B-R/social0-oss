/**
 * Image resizer presets, one page per platform at /free-tools/image-resizer/<slug>.
 * scripts/generate-sitemap.mjs reads slug/metaTitle/metaDescription with a regex:
 * keep `metaDescription:` followed by the string on the next line, with no double quotes inside.
 */
import type { FreeToolFaq } from "./free-tools";

export type ImageFormat = { label: string; w: number; h: number; note?: string };

export type ResizerPlatform = {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  formats: ImageFormat[];
  /** Practical tips shown on the page and to crawlers. */
  tips: string[];
  faq: FreeToolFaq[];
};

export const IMAGE_RESIZER_PATH = "/free-tools/image-resizer";
export const resizerPath = (slug: string) => `${IMAGE_RESIZER_PATH}/${slug}`;

const privacyFaq: FreeToolFaq = {
  question: "Is my image uploaded anywhere?",
  answer: "No. The resizing runs in your browser, so the image never leaves your device until you post it.",
};

export const RESIZER_PLATFORMS: ResizerPlatform[] = [
  {
    slug: "instagram",
    name: "Instagram",
    metaTitle: "Instagram Image Resizer: Post, Story, Reel Sizes (Free) | Social0",
    metaDescription:
      "Resize any image to Instagram sizes: 1080x1350 portrait, 1080x1080 square, 1080x1920 story and reel cover. Crop or fit, free, nothing uploaded.",
    formats: [
      { label: "Portrait post (4:5)", w: 1080, h: 1350, note: "Takes the most room in the feed." },
      { label: "Square post", w: 1080, h: 1080 },
      { label: "Story / Reel", w: 1080, h: 1920 },
      { label: "Landscape post", w: 1080, h: 566 },
    ],
    tips: [
      "The profile grid shows posts as 3:4 rectangles, so keep the subject in the middle of a 4:5 post.",
      "Stories and Reels cover the top and bottom with the profile name and reply bar; keep text away from those edges.",
      "Use one shape for every slide in a carousel; Instagram crops them all to the first slide's shape."
    ],
    faq: [
      {
        question: "What size should an Instagram post be?",
        answer: "1080 x 1350 px (4:5) for portrait, which takes the most space in the feed, or 1080 x 1080 px for square. Stories and Reels are 1080 x 1920 px (9:16).",
      },
      privacyFaq,
    ],
  },
  {
    slug: "x",
    name: "X (Twitter)",
    metaTitle: "X (Twitter) Image Resizer: Post and Header Sizes (Free) | Social0",
    metaDescription:
      "Resize images for X: 1600x900 post image, 1080x1080 square, 1500x500 header and 400x400 profile photo. Crop or fit, free, nothing uploaded.",
    formats: [
      { label: "Post image (16:9)", w: 1600, h: 900 },
      { label: "Square post", w: 1080, h: 1080 },
      { label: "Header", w: 1500, h: 500 },
      { label: "Profile photo", w: 400, h: 400 },
    ],
    tips: [
      "16:9 images show uncropped in the timeline; other shapes may be cropped in the preview.",
      "You can attach up to 4 images to one post.",
      "On the header, the profile photo covers the bottom-left corner, so keep text to the right."
    ],
    faq: [
      {
        question: "What image size works best on X?",
        answer: "1600 x 900 px (16:9) shows uncropped in the timeline. The header is 1500 x 500 px and the profile photo 400 x 400 px.",
      },
      privacyFaq,
    ],
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    metaTitle: "LinkedIn Image Resizer: Post, Banner Sizes (Free) | Social0",
    metaDescription:
      "Resize images for LinkedIn: 1200x627 link image, 1080x1080 square, 1080x1350 portrait and 1584x396 banner. Crop or fit, free, nothing uploaded.",
    formats: [
      { label: "Post image (landscape)", w: 1200, h: 627 },
      { label: "Square post", w: 1080, h: 1080 },
      { label: "Portrait post", w: 1080, h: 1350 },
      { label: "Profile banner", w: 1584, h: 396 },
    ],
    tips: [
      "Portrait 4:5 images take up more of the feed on phones than landscape ones.",
      "On the profile banner, your photo covers part of the left side; keep important parts on the right.",
      "Text in images should be large: most people read LinkedIn on a phone."
    ],
    faq: [
      {
        question: "What is the best image size for a LinkedIn post?",
        answer: "1200 x 627 px for landscape images, or 1080 x 1350 px portrait, which takes more of the feed on phones. The profile banner is 1584 x 396 px.",
      },
      privacyFaq,
    ],
  },
  {
    slug: "facebook",
    name: "Facebook",
    metaTitle: "Facebook Image Resizer: Post, Story, Cover Sizes (Free) | Social0",
    metaDescription:
      "Resize images for Facebook: 1200x630 post, 1080x1080 square, 1080x1920 story and 851x315 Page cover. Crop or fit, free, nothing uploaded.",
    formats: [
      { label: "Post / link image", w: 1200, h: 630 },
      { label: "Square post", w: 1080, h: 1080 },
      { label: "Story", w: 1080, h: 1920 },
      { label: "Page cover", w: 851, h: 315 },
    ],
    tips: [
      "The Page cover is cropped differently on phones and desktops; keep the important part in the middle.",
      "Square and 4:5 images take more room in the mobile feed than landscape ones.",
      "Stories cover the top and bottom with buttons; keep text in the middle."
    ],
    faq: [
      {
        question: "What size is a Facebook post image?",
        answer: "1200 x 630 px for landscape posts and link images, 1080 x 1080 px for square. Stories are 1080 x 1920 px.",
      },
      privacyFaq,
    ],
  },
  {
    slug: "youtube",
    name: "YouTube",
    metaTitle: "YouTube Thumbnail & Banner Resizer (Free) | Social0",
    metaDescription:
      "Resize images to a 1280x720 YouTube thumbnail, 2560x1440 channel banner or 1080x1920 Shorts cover. Crop or fit, free, nothing uploaded.",
    formats: [
      { label: "Thumbnail", w: 1280, h: 720, note: "Keep it under 2 MB." },
      { label: "Channel banner", w: 2560, h: 1440, note: "Text-safe area is the middle 1546 x 423." },
      { label: "Shorts cover", w: 1080, h: 1920 },
    ],
    tips: [
      "Keep the thumbnail under 2 MB and readable at a small size: big face, few words.",
      "The video length covers the bottom-right corner of the thumbnail.",
      "Only the middle 1546 x 423 of the banner shows on every device; put text and logos there."
    ],
    faq: [
      {
        question: "What size is a YouTube thumbnail?",
        answer: "1280 x 720 px (16:9), under 2 MB. The channel banner is 2560 x 1440 px with the important part in the middle 1546 x 423.",
      },
      privacyFaq,
    ],
  },
  {
    slug: "tiktok",
    name: "TikTok",
    metaTitle: "TikTok Image Resizer: 1080x1920 Photo Posts (Free) | Social0",
    metaDescription:
      "Resize images to 1080x1920 for TikTok photo posts and video covers, or 200x200 for a profile photo. Crop or fit, free, nothing uploaded.",
    formats: [
      { label: "Photo post / cover", w: 1080, h: 1920 },
      { label: "Profile photo", w: 200, h: 200 },
    ],
    tips: [
      "TikTok's buttons cover the right side and the caption covers the bottom; keep text in the centre.",
      "Use full-screen 9:16 images so photo posts don't get bars.",
      "The profile photo shows as a circle, so keep the face in the middle."
    ],
    faq: [
      {
        question: "What size are TikTok photo posts?",
        answer: "1080 x 1920 px (9:16) fills the screen. Other shapes get bars above and below.",
      },
      privacyFaq,
    ],
  },
  {
    slug: "pinterest",
    name: "Pinterest",
    metaTitle: "Pinterest Pin Size Resizer: 1000x1500 (Free) | Social0",
    metaDescription:
      "Resize images to the 1000x1500 standard Pin (2:3) or a 1000x1000 square Pin. Crop or fit, free, nothing uploaded.",
    formats: [
      { label: "Standard Pin (2:3)", w: 1000, h: 1500 },
      { label: "Square Pin", w: 1000, h: 1000 },
    ],
    tips: [
      "2:3 Pins fit the feed best; much taller Pins can get cut off.",
      "Add a short text overlay: people scan Pins quickly.",
      "Use a clear, bright image; Pinterest is a visual search engine."
    ],
    faq: [
      {
        question: "What is the best Pinterest Pin size?",
        answer: "1000 x 1500 px (2:3). Taller Pins can get cut off in the feed.",
      },
      privacyFaq,
    ],
  },
  {
    slug: "threads",
    name: "Threads",
    metaTitle: "Threads Image Resizer: Post Sizes (Free) | Social0",
    metaDescription:
      "Resize images for Threads posts: 1080x1350 portrait or 1080x1080 square. Crop or fit, free, nothing uploaded.",
    formats: [
      { label: "Portrait post", w: 1080, h: 1350 },
      { label: "Square post", w: 1080, h: 1080 },
    ],
    tips: [
      "Threads uses the same shapes as Instagram, so one 4:5 export works for both.",
      "Portrait images take more room in the feed than landscape ones.",
      "Keep text large; most people use Threads on a phone."
    ],
    faq: [
      {
        question: "What image size works on Threads?",
        answer: "1080 x 1350 px portrait or 1080 x 1080 px square, the same shapes as Instagram.",
      },
      privacyFaq,
    ],
  },
  {
    slug: "bluesky",
    name: "Bluesky",
    metaTitle: "Bluesky Image Resizer: Post and Banner Sizes (Free) | Social0",
    metaDescription:
      "Resize images for Bluesky: 1200x675 post image, 1080x1080 square and 3000x1000 profile banner. Crop or fit, free, nothing uploaded.",
    formats: [
      { label: "Post image (16:9)", w: 1200, h: 675 },
      { label: "Square post", w: 1080, h: 1080 },
      { label: "Profile banner", w: 3000, h: 1000 },
    ],
    tips: [
      "Bluesky caps each image at 1 MB; JPG exports from this tool usually stay under that.",
      "You can add up to 4 images to one post.",
      "Add alt text after uploading; Bluesky users expect it."
    ],
    faq: [
      {
        question: "What image size should I use on Bluesky?",
        answer: "1200 x 675 px (16:9) or 1080 x 1080 px square for posts, and 3000 x 1000 px for the profile banner. Bluesky also caps each image at 1 MB.",
      },
      privacyFaq,
    ],
  },
];

/**
 * Where to draw a `sw x sh` image on a `dw x dh` canvas.
 * cover: fill and crop the overflow (centered). contain: fit inside, leave bars.
 */
export function fitRect(
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  mode: "cover" | "contain",
): { x: number; y: number; w: number; h: number } {
  const scale = mode === "cover" ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}
