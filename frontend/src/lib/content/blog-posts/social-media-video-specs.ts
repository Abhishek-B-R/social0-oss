import type { BlogPost } from "../blog-types";

export const socialMediaVideoSpecs: BlogPost = {
  slug: "social-media-video-specs",
  category: "Platform specs",
  metaTitle: "Social Media Video Specs 2026: Length, Size & Format by Platform",
  metaDescription:
    "Max video length, file size, aspect ratio, and accepted formats for TikTok, Reels, Shorts, X, LinkedIn, Facebook, Threads, Pinterest, and Bluesky — the limits that actually fail a publish.",
  keywords: [
    "social media video specs",
    "social media video size limits",
    "max video length by platform",
    "tiktok video requirements",
    "instagram reels video length",
    "youtube shorts requirements",
    "linkedin video specs",
    "bluesky video limit",
  ],
  title: "Social media video specs in 2026: length, size, and format by platform",
  excerpt:
    "One 4-minute vertical video is a Reel, a TikTok, a LinkedIn post — and too long for YouTube Shorts and Bluesky. Here is the full spec table, and the three limits that cause most failed publishes.",
  datePublished: "2026-08-12",
  dateModified: "2026-09-20",
  readingMinutes: 10,
  body: [
    {
      type: "paragraph",
      text: "Caption limits truncate. Video limits **fail**. If a file is three seconds too long or forty megabytes too big, the platform rejects the upload outright — usually after the upload finishes, and usually with an error message that does not name the actual problem.",
    },
    {
      type: "paragraph",
      text: "The table below is the set of video limits Social0 checks before a publish is allowed out, so a file that will be rejected gets caught in the composer rather than at 9am on a Tuesday.",
    },
    {
      type: "heading",
      text: "Video length and file size by platform",
    },
    {
      type: "table",
      caption:
        "Maximum duration and file size accepted through each platform's publishing API.",
      columns: ["Platform", "Max duration", "Max file size", "Formats"],
      rows: [
        [
          "X (Twitter)",
          "2:20 free / 10:00 Premium",
          "512 MB",
          "MP4, MOV",
        ],
        ["Instagram", "20:00 (API cap)", "250 MB", "MP4, MOV"],
        ["TikTok", "10:00", "~288 MB", "MP4, MOV"],
        ["YouTube Shorts", "5:00", "256 MB", "MP4, MOV"],
        ["LinkedIn", "10:00", "5 GB", "MP4, MOV, MKV, WebM"],
        ["Facebook", "10:00 (feed)", "4 GB", "MP4, MOV"],
        ["Pinterest", "15:00", "2 GB", "MP4, MOV"],
        ["Threads", "5:00", "1 GB", "MP4, MOV"],
        ["Bluesky", "3:00", "100 MB", "MP4, MOV, WebM, MPEG"],
      ],
    },
    {
      type: "callout",
      title: "The three that bind first",
      text: "**Bluesky at 3:00 and 100 MB**, **X at 2:20 for non-Premium accounts**, and **YouTube Shorts at 5:00**. If any of those three is in your selection, it sets the ceiling for the whole cross-post.",
    },
    {
      type: "heading",
      text: "The soft limits nobody tells you about",
    },
    {
      type: "paragraph",
      text: "A publish can succeed and still be quietly penalised. These are the thresholds that do not throw an error but do cost you reach.",
    },
    {
      type: "subheading",
      text: "Instagram's 3-minute cliff",
    },
    {
      type: "paragraph",
      text: "The API will accept a Reel up to 20 minutes. But past roughly **3 minutes**, Instagram stops pushing the video to non-followers. It stays on your profile, your existing audience sees it, and your reach graph looks like the post failed. It did not — it was just excluded from discovery.",
    },
    {
      type: "paragraph",
      text: "If growth is the goal, treat 3:00 as the real Instagram limit and 20:00 as the technical one.",
    },
    {
      type: "subheading",
      text: "YouTube's Shorts boundary",
    },
    {
      type: "paragraph",
      text: "A vertical video **3 minutes or under** is classified as a Short and enters the Shorts feed. Between 3 and 5 minutes it uploads fine but is treated as a regular video, which means a completely different distribution surface and a completely different audience. The file is identical; the outcome is not.",
    },
    {
      type: "subheading",
      text: "TikTok's resolution floor",
    },
    {
      type: "paragraph",
      text: "TikTok's Content Posting API expects vertical 9:16 at **720×1280 or higher**. A 480p export or a landscape video will be rejected at the upload step rather than the publish step, which makes the error harder to trace.",
    },
    {
      type: "heading",
      text: "Aspect ratios that work everywhere",
    },
    {
      type: "paragraph",
      text: "You have two sensible masters, not nine.",
    },
    {
      type: "table",
      columns: ["Master", "Dimensions", "Where it works"],
      rows: [
        [
          "Vertical 9:16",
          "1080 × 1920",
          "TikTok, Reels, Shorts, Stories, Threads, Pinterest. The default for short-form.",
        ],
        [
          "Square 1:1",
          "1080 × 1080",
          "X, LinkedIn, Facebook feed. Safe everywhere, wastes vertical real estate.",
        ],
        [
          "Landscape 16:9",
          "1920 × 1080",
          "YouTube long-form, LinkedIn, X. Gets letterboxed badly on vertical surfaces.",
        ],
      ],
    },
    {
      type: "callout",
      title: "Safe-area rule",
      text: "On 9:16 video, keep text and faces out of the top ~12% and bottom ~20%. That band is where platform UI — captions, handles, CTA buttons, the progress bar — sits, and it differs on every app. Anything important there gets covered on at least one network.",
    },
    {
      type: "heading",
      text: "Encoding settings that avoid re-compression damage",
    },
    {
      type: "paragraph",
      text: "Every platform re-encodes what you upload. You cannot avoid that, but you can avoid feeding it a file that degrades badly.",
    },
    {
      type: "list",
      items: [
        "**Container / codec:** MP4 with H.264 video and AAC audio. Universally accepted, no exceptions. H.265/HEVC is accepted in places and rejected in others — not worth the risk for cross-posting.",
        "**Frame rate:** 30fps for most content. Use 60fps only for motion-heavy footage; it doubles your bitrate budget for little visible gain on a phone.",
        "**Bitrate:** 8–12 Mbps for 1080p vertical. Higher is wasted — every network will re-compress it down anyway.",
        "**Audio:** 128 kbps AAC, stereo, 44.1 kHz. Normalise to around -14 LUFS so your video is not noticeably quieter than the one before it in the feed.",
        "**Colour:** Export in sRGB. Masters in Display P3 or Rec. 2020 shift visibly once a platform converts them.",
        "**Keyframes:** A keyframe every 2 seconds helps thumbnail selection and scrubbing behave.",
      ],
    },
    {
      type: "heading",
      text: "Why one file fails on one network and not another",
    },
    {
      type: "paragraph",
      text: "The most common support question in any scheduling tool is some version of “it posted to four platforms and failed on the fifth”. Almost always it is one of these:",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Duration over the hard cap.** A 4-minute video is fine on TikTok and LinkedIn, over the line on Threads and YouTube Shorts, and well over on Bluesky.",
        "**File size over the cap.** A 200 MB export clears Instagram and dies on Bluesky's 100 MB ceiling. Size caps vary by a factor of fifty across these nine networks.",
        "**Wrong aspect ratio for the surface.** A landscape video sent to TikTok is rejected, not letterboxed.",
        "**Token expired mid-upload.** Long uploads are exactly when a stale OAuth token surfaces. This is a reconnect, not a retry — retrying the same job fails identically.",
        "**Daily publishing quota.** Instagram caps API-published posts per account in a rolling 24-hour window. Covered in [the Instagram API rate limits guide](/blog/instagram-api-rate-limits).",
      ],
    },
    {
      type: "paragraph",
      text: "A scheduler earns its keep by catching the first three before upload, surfacing the fourth as a reconnect prompt rather than a generic error, and reporting the fifth per-platform instead of failing the whole post.",
    },
    {
      type: "cta",
      text: "See which accounts a video will fail on before you upload it.",
      href: "/features/multi-platform-scheduler",
      label: "Multi-platform scheduler",
    },
    {
      type: "heading",
      text: "A practical export preset",
    },
    {
      type: "paragraph",
      text: "If you want one export that clears every network in the table above without thinking about it:",
    },
    {
      type: "code",
      language: "bash",
      code: `# 1080x1920 vertical, H.264/AAC, safely under every size cap
ffmpeg -i input.mov \\
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,\\
pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" \\
  -c:v libx264 -profile:v high -preset slow -crf 22 \\
  -maxrate 10M -bufsize 20M -pix_fmt yuv420p \\
  -r 30 -g 60 \\
  -c:a aac -b:a 128k -ar 44100 -ac 2 \\
  -movflags +faststart \\
  output.mp4`,
    },
    {
      type: "paragraph",
      text: "Keep it under 3 minutes and that single file is valid on all nine networks in this guide. `-movflags +faststart` matters more than it looks: it moves the metadata to the front of the file so platforms can begin processing before the whole upload lands.",
    },
    {
      type: "heading",
      text: "Keep the numbers in one place",
    },
    {
      type: "paragraph",
      text: "These limits change — Bluesky's video duration, Instagram's API cap, and X's Premium ceiling have all moved recently. If you are building your own publisher, keep them in a single constants module and validate before upload rather than discovering them from platform error codes. If you are not, use a tool that tracks them for you.",
    },
  ],
  faq: [
    {
      question: "What is the maximum video length for each social platform?",
      answer:
        "Instagram accepts up to 20 minutes through its API, Pinterest 15, TikTok, LinkedIn and Facebook 10, YouTube Shorts and Threads 5, Bluesky 3, and X 2:20 for standard accounts or 10 minutes with Premium.",
    },
    {
      question: "What video format works on every social platform?",
      answer:
        "MP4 with H.264 video and AAC audio. It is accepted everywhere without exception. Export at 1080×1920 for vertical content, keep it under 3 minutes and under 100 MB, and the same file is valid on all nine major networks.",
    },
    {
      question: "Why does Instagram limit reach on videos over 3 minutes?",
      answer:
        "Instagram accepts Reels up to 20 minutes through the API, but past roughly 3 minutes it stops recommending them to non-followers. The post publishes successfully and existing followers see it — it is simply excluded from discovery surfaces.",
    },
    {
      question: "What makes a video a YouTube Short instead of a regular video?",
      answer:
        "Vertical videos of 3 minutes or less are classified as Shorts and enter the Shorts feed. Between 3 and 5 minutes the same file uploads as a regular video with completely different distribution.",
    },
    {
      question: "Which platform has the smallest video file size limit?",
      answer:
        "Bluesky at 100 MB, followed by YouTube Shorts at 256 MB and Instagram at 250 MB. LinkedIn is the most generous at 5 GB. If Bluesky is in your cross-post selection, it sets the ceiling.",
    },
  ],
  relatedPaths: [
    { href: "/features/tiktok-scheduler", label: "TikTok scheduler" },
    { href: "/features/youtube-scheduler", label: "YouTube scheduler" },
    { href: "/tools/bulk-video", label: "Bulk video tools" },
  ],
  relatedSlugs: [
    "social-media-character-limits",
    "social-media-image-sizes",
    "why-scheduled-posts-fail",
  ],
};
