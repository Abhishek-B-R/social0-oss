import type { BlogPost } from "../blog-types";

export const socialMediaImageSizes: BlogPost = {
  slug: "social-media-image-sizes",
  category: "Platform specs",
  metaTitle: "Social Media Image Sizes 2026: Cheat Sheet for Every Platform",
  metaDescription:
    "Exact image dimensions for Instagram, X, LinkedIn, Facebook, Pinterest, TikTok, Threads, YouTube, and Bluesky — feed posts, stories, profile photos, and covers, in one table.",
  keywords: [
    "social media image sizes",
    "social media image dimensions",
    "instagram post size",
    "linkedin image size",
    "facebook cover photo size",
    "pinterest pin size",
    "social media image size cheat sheet",
  ],
  title: "Social media image sizes in 2026: the cheat sheet",
  excerpt:
    "You need three master sizes, not thirty. Here is every dimension that matters per platform, which ones you can safely ignore, and the export settings that stop platforms from mangling your images.",
  datePublished: "2026-08-19",
  dateModified: "2026-09-20",
  readingMinutes: 8,
  body: [
    {
      type: "paragraph",
      text: "Most image size guides list sixty dimensions and leave you to work out which ones you actually need. You need three. Everything else is a variation you can crop from them.",
    },
    {
      type: "heading",
      text: "The three masters",
    },
    {
      type: "table",
      caption: "Design at these three sizes and you cover every feed surface.",
      columns: ["Master", "Dimensions", "Ratio", "Covers"],
      rows: [
        [
          "Portrait",
          "1080 × 1350",
          "4:5",
          "Instagram feed, Facebook feed, LinkedIn, Threads. Takes the most vertical space in a scrolling feed.",
        ],
        [
          "Vertical / full screen",
          "1080 × 1920",
          "9:16",
          "Stories, Reels, TikTok, Shorts, Pinterest Idea Pins.",
        ],
        [
          "Square",
          "1080 × 1080",
          "1:1",
          "Universal fallback. Displays uncropped on every network in this guide.",
        ],
      ],
    },
    {
      type: "callout",
      title: "If you only remember one thing",
      text: "**1080 × 1080 never gets cropped anywhere.** It is not the best-performing size on any single platform, but it is the only one that is safe on all of them. Use it when you are cross-posting one asset and will not make variants.",
    },
    {
      type: "heading",
      text: "Feed image sizes by platform",
    },
    {
      type: "table",
      columns: ["Platform", "Recommended feed image", "Accepted ratios"],
      rows: [
        ["Instagram", "1080 × 1350 (4:5)", "1.91:1 to 4:5"],
        ["Facebook", "1200 × 630 (1.91:1) or 1080 × 1350", "Wide range; 4:5 gets most feed height"],
        ["LinkedIn", "1200 × 1200 (1:1) or 1200 × 627", "1:1 and 1.91:1 both display well"],
        ["X (Twitter)", "1600 × 900 (16:9)", "16:9 inline; 1:1 and 4:5 supported"],
        ["Pinterest", "1000 × 1500 (2:3)", "2:3 is strongly preferred; taller gets truncated"],
        ["Threads", "1080 × 1350 (4:5)", "Similar handling to Instagram"],
        ["Bluesky", "1080 × 1350 or 1200 × 675", "Flexible; cropped to ratio in feed preview"],
        ["TikTok (photo posts)", "1080 × 1920 (9:16)", "Vertical strongly preferred"],
        ["YouTube (thumbnail)", "1280 × 720 (16:9)", "16:9 only; 2 MB max"],
      ],
    },
    {
      type: "heading",
      text: "Profile photos, covers, and banners",
    },
    {
      type: "paragraph",
      text: "These change rarely, so get them right once and stop thinking about them.",
    },
    {
      type: "table",
      columns: ["Asset", "Dimensions", "Note"],
      rows: [
        ["Profile photo (all platforms)", "400 × 400 minimum", "Displays as a circle almost everywhere — keep content centred."],
        ["Facebook cover", "1640 × 856", "Heavily cropped on mobile; keep text in the middle third."],
        ["LinkedIn personal banner", "1584 × 396", "Profile photo overlaps the lower left."],
        ["LinkedIn company banner", "1128 × 191", "Different from the personal banner — a common mistake."],
        ["X header", "1500 × 500", "Avatar overlaps lower left; UI overlays the bottom."],
        ["YouTube channel art", "2560 × 1440", "Only the central 1546 × 423 is guaranteed visible."],
      ],
    },
    {
      type: "callout",
      title: "Banner safe areas",
      text: "Every banner is cropped differently on desktop, mobile, and tablet. The reliable approach is to treat the **central third** as the only guaranteed-visible region and let the edges be decorative. Never put a logo or URL in a corner.",
    },
    {
      type: "heading",
      text: "Export settings",
    },
    {
      type: "list",
      items: [
        "**Colour space: sRGB.** Every platform converts on upload. A Display P3 or Adobe RGB master will come back visibly duller or shifted. This is the single most common cause of “my colours look wrong on Instagram”.",
        "**Format: JPEG for photos, PNG for graphics with text or flat colour.** PNG keeps text edges crisp; JPEG handles gradients without banding. WebP is accepted in most places but not all — not worth it for cross-posting.",
        "**Quality: 85–90% JPEG.** Above 90% you are shipping file size the platform will compress away anyway. Below 80% you get artefacts that survive re-compression.",
        "**Width: 1080px is enough.** Uploading a 4000px master does not improve the result — platforms downscale to roughly 1080 and re-compress. A well-exported 1080px file beats a downscaled 4000px one.",
        "**Strip metadata**, except when you want the copyright field preserved. EXIF adds weight and can leak location.",
      ],
    },
    {
      type: "subheading",
      text: "About “design at 2x”",
    },
    {
      type: "paragraph",
      text: "The common advice to design at 2160px for retina is half right. Design your canvas at 2x so text and vector edges stay sharp while you work, then **export at 1080px**. Uploading the 2160px file does not give you a sharper result — the platform's downscale is worse than your export tool's.",
    },
    {
      type: "heading",
      text: "Text on images",
    },
    {
      type: "paragraph",
      text: "Three rules that matter more than the pixel dimensions:",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Minimum 24px text at 1080px wide.** Anything smaller is unreadable on a phone, which is where nearly all of your views happen.",
        "**Keep text inside the central 80%.** Different platforms crop differently in feed previews, and the first crop is the one that decides whether someone taps.",
        "**Assume the first render is the crop, not the full image.** Instagram shows a 1:1 crop of a 4:5 image in the profile grid. Design the centre square to work on its own.",
      ],
    },
    {
      type: "heading",
      text: "One asset or several?",
    },
    {
      type: "paragraph",
      text: "The honest answer depends on what you are posting.",
    },
    {
      type: "list",
      items: [
        "**One square asset** when the image is supporting a text post — a screenshot, a chart, a quote card. The caption is doing the work.",
        "**Two assets (4:5 and 9:16)** when the image *is* the post. This is the normal case for visual brands and costs one extra export.",
        "**Per-platform assets** only when a network has a genuinely different job — a Pinterest 2:3 pin with baked-in text, or a YouTube thumbnail. These are different creative, not different crops.",
      ],
    },
    {
      type: "paragraph",
      text: "Social0 accepts one upload and lets you attach it to every selected account, with per-platform captions where the copy needs to differ. Images are handled server-side per platform, so you are not re-exporting the same asset nine times.",
    },
    {
      type: "cta",
      text: "Upload once, publish to nine networks in parallel.",
      href: "/features/instagram-scheduler",
      label: "See the Instagram scheduler",
    },
    {
      type: "heading",
      text: "Carousels and multi-image posts",
    },
    {
      type: "paragraph",
      text: "Carousels have one rule that catches people: **the first image sets the ratio for the whole carousel.** If image one is 1:1 and image two is 4:5, image two gets centre-cropped to square. Export every slide at the same dimensions before you upload.",
    },
    {
      type: "table",
      columns: ["Platform", "Max images per post"],
      rows: [
        ["Instagram carousel", "20"],
        ["X", "4"],
        ["Bluesky", "4"],
        ["LinkedIn", "20 (as a document post)"],
        ["Threads", "20"],
      ],
    },
    {
      type: "paragraph",
      text: "If you are scheduling a lot of image content at once, bulk upload is worth the setup — Social0's [bulk image tools](/tools/bulk-image) take a folder of images and spread them across a schedule rather than making you create each post by hand.",
    },
  ],
  faq: [
    {
      question: "What is the best image size for social media in 2026?",
      answer:
        "1080 × 1350 (4:5 portrait) for feed posts and 1080 × 1920 (9:16) for stories and full-screen video. If you only want one asset that works everywhere without cropping, use 1080 × 1080 square.",
    },
    {
      question: "What image size works on all social platforms?",
      answer:
        "1080 × 1080 pixels. A 1:1 square displays without cropping on Instagram, Facebook, X, LinkedIn, Threads, Bluesky, and Pinterest. It is not optimal on any of them individually but it is safe on all of them.",
    },
    {
      question: "Should I upload images larger than 1080px wide?",
      answer:
        "No. Platforms downscale and re-compress to roughly 1080px regardless. A carefully exported 1080px JPEG at 85–90% quality produces a better final result than a 4000px master put through the platform's own downscaler.",
    },
    {
      question: "Why do my images look washed out after uploading?",
      answer:
        "Almost always a colour space problem. Platforms convert everything to sRGB on upload, so a master exported in Display P3 or Adobe RGB shifts visibly. Export in sRGB and the uploaded version will match what you designed.",
    },
    {
      question: "What size should Instagram carousel images be?",
      answer:
        "All slides at the same dimensions — 1080 × 1350 works well. The first image determines the aspect ratio for the entire carousel, so any slide with a different ratio gets centre-cropped to match it.",
    },
  ],
  relatedPaths: [
    { href: "/tools/bulk-image", label: "Bulk image scheduling" },
    { href: "/features/pinterest-scheduler", label: "Pinterest scheduler" },
    { href: "/features/instagram-scheduler", label: "Instagram scheduler" },
  ],
  relatedSlugs: [
    "social-media-video-specs",
    "social-media-character-limits",
    "cross-posting-vs-repurposing",
  ],
};
