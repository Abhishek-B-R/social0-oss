/**
 * Standalone free tools served at /free-tools/<slug>.
 * scripts/generate-sitemap.mjs reads slug/metaTitle/metaDescription with a regex:
 * keep `metaDescription:` followed by the string on the next line, with no double quotes inside.
 */
import type { FreeToolFaq } from "./free-tools";

export type StandaloneTool = {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  howTo: string[];
  notes: string[];
  faq: FreeToolFaq[];
};

export const freeToolPath = (slug: string) => `/free-tools/${slug}`;

export const LINKEDIN_FORMATTER: StandaloneTool = {
  slug: "linkedin-text-formatter",
  name: "LinkedIn Text Formatter",
  metaTitle: "LinkedIn Text Formatter: Bold, Italic, Underline (Free) | Social0",
  metaDescription:
    "Make bold, italic, underlined or strikethrough text and bullet lists for LinkedIn posts, with a live preview and copy button. Free, no signup.",
  intro:
    "LinkedIn posts have no bold or italic button. This formatter swaps your letters for Unicode look-alikes (𝗯𝗼𝗹𝗱, 𝘪𝘵𝘢𝘭𝘪𝘤, u̲n̲d̲e̲r̲l̲i̲n̲e̲) that LinkedIn shows as plain text, so the styling survives when you paste it. Select text, pick a style, then copy.",
  howTo: [
    "Write or paste your post.",
    "Select the words you want to style and press Bold, Italic or another button. Press it again to undo.",
    "Check the preview, then copy the post into LinkedIn or schedule it with Social0.",
  ],
  notes: [
    "Use styling for a few words, not whole paragraphs: screen readers spell Unicode letters out or skip them, and LinkedIn search may not match them.",
    "Only A–Z, a–z and digits change. Accented letters, other alphabets and emoji stay as they are.",
    "Works the same in X, Threads, Instagram and Facebook posts.",
  ],
  faq: [
    {
      question: "How do I write bold text on LinkedIn?",
      answer:
        "LinkedIn has no formatting in posts, so bold text is made from Unicode letters that look bold. Select your text here, press Bold, copy the post and paste it into LinkedIn.",
    },
    {
      question: "Is bold Unicode text bad for accessibility?",
      answer:
        "It can be. Screen readers may read each styled letter by its Unicode name or skip it, and search may not find styled words. Keep it to a short heading or key phrase.",
    },
    {
      question: "Does formatted text count against the 3,000-character limit?",
      answer:
        "Yes. Each styled letter still counts as one character in the counter here. Underline and strikethrough add a combining mark to each letter, so LinkedIn may count those words double.",
    },
    {
      question: "Can I schedule the formatted post?",
      answer:
        "Yes. Press Schedule this post and Social0 opens it as a draft with the styling kept, ready for LinkedIn and 8 other networks. The free plan covers 3 accounts.",
    },
  ],
};

export const INSTAGRAM_GRID: StandaloneTool = {
  slug: "instagram-grid-maker",
  name: "Instagram Grid Maker",
  metaTitle: "Instagram Grid Maker: Split a Photo into 3, 6, 9 or 12 Posts (Free) | Social0",
  metaDescription:
    "Split one image into an Instagram profile grid of 3, 6, 9 or 12 tiles in the new 3:4 shape, numbered in posting order. Free, nothing uploaded.",
  intro:
    "Turn one big image into a profile grid that lines up perfectly. Pick 1 to 4 rows, and the tool cuts your image into 3-column tiles in Instagram's 3:4 grid shape (or classic square), numbered in the order to post them.",
  howTo: [
    "Drop in your image and pick how many rows.",
    "Download the tiles. Each one is numbered in posting order.",
    "Post tile 1 first and the highest number last. Instagram shows the newest post top-left, so the picture lines up.",
  ],
  notes: [
    "Since 2025 the profile grid shows posts as 3:4 rectangles, so 3:4 tiles (1080 x 1440) line up without being cropped. Square tiles still work but get trimmed at the sides.",
    "Post all tiles in one go. Anything you post later pushes the grid one tile along.",
    "The image is cut in your browser and never uploaded.",
  ],
  faq: [
    {
      question: "How do I split a picture into a grid for Instagram?",
      answer:
        "Drop the image in, choose rows, download the numbered tiles and post them from 1 upward. With 3 columns and 3 rows you get 9 posts that form one picture on your profile.",
    },
    {
      question: "What size should Instagram grid tiles be?",
      answer:
        "1080 x 1440 px (3:4), the shape the profile grid has used since 2025. For a square grid, use 1080 x 1080 px.",
    },
    {
      question: "In what order do I post the tiles?",
      answer:
        "Start with tile 1 (bottom-right) and finish with the highest number (top-left). Social0 can schedule them a minute apart so you don't have to post by hand.",
    },
  ],
};

export const INSTAGRAM_CAROUSEL: StandaloneTool = {
  slug: "instagram-carousel-splitter",
  name: "Instagram Carousel Splitter",
  metaTitle: "Instagram Carousel Splitter: Seamless Panorama Slides (Free) | Social0",
  metaDescription:
    "Cut a panorama or wide design into 2 to 10 seamless Instagram carousel slides, 4:5 or square, that line up when people swipe. Free, nothing uploaded.",
  intro:
    "Make a seamless carousel: one wide image cut into slides that join up as people swipe. Pick the number of slides and the slide shape, then download them in order.",
  howTo: [
    "Drop in a wide image, like a panorama or a design made for swiping.",
    "Pick how many slides and the slide shape (4:5 portrait or square).",
    "Download the slides and add them to one carousel post in order, 1 first.",
  ],
  notes: [
    "4:5 slides (1080 x 1350) take the most room in the feed.",
    "Your image is scaled to fill the full strip and trimmed evenly at the top and bottom or the ends, so keep important parts away from the edges.",
    "Instagram carousels take up to 20 slides; this tool cuts 2 to 10.",
  ],
  faq: [
    {
      question: "How do I post a panorama on Instagram without it shrinking?",
      answer:
        "Cut it into slides of the same shape and post them as one carousel. Each slide shows full-size, and the panorama joins up as people swipe.",
    },
    {
      question: "What size should seamless carousel slides be?",
      answer:
        "1080 x 1350 px (4:5) each for portrait slides, or 1080 x 1080 px for square. A 3-slide 4:5 panorama starts as a 3240 x 1350 px image.",
    },
    {
      question: "Can I schedule a carousel?",
      answer:
        "Yes. Social0 schedules Instagram carousels; add the slides in order to one post. The free plan covers 3 accounts.",
    },
  ],
};

export const THREAD_MAKER: StandaloneTool = {
  slug: "twitter-thread-maker",
  name: "X (Twitter) Thread Maker",
  metaTitle: "Twitter Thread Maker: Split Long Text into a Thread (Free) | Social0",
  metaDescription:
    "Paste long text and split it into an X (Twitter) thread that breaks at sentences, with optional 1/5 numbering. Also works for Threads and Bluesky. Free.",
  intro:
    "Paste a long post, an article or notes, and get a thread where every post fits. It breaks at the end of sentences, counts characters the way X does (links count 23), and can number posts 1/5, 2/5. Switch to Threads or Bluesky for their limits.",
  howTo: [
    "Paste your text. Leave a blank line wherever you want a new post to start, and turn on that option.",
    "Pick X, Threads or Bluesky and whether to number the posts.",
    "Copy each post, or schedule the whole thread in Social0.",
  ],
  notes: [
    "X: 280 characters per post, links count 23, emoji 2. Threads: 500. Bluesky: 300.",
    "A thread's first post does most of the work. Make it a full thought that makes people want the rest.",
    "Numbering (1/5) helps readers know how long the thread is, but costs about 5 characters per post.",
  ],
  faq: [
    {
      question: "How do I make a thread on X (Twitter)?",
      answer:
        "Write the full text, split it into posts of up to 280 characters, then post the first one and reply to it with the next. This tool does the splitting; Social0 can post the whole thread for you.",
    },
    {
      question: "Where does the tool split my text?",
      answer:
        "At the end of a sentence whenever possible, then between words. It only cuts inside a word when a single word is longer than a whole post.",
    },
    {
      question: "Can I schedule the thread?",
      answer:
        "Yes. Press Schedule this thread and Social0 opens it with every post in place, ready to schedule to X, Threads or Bluesky. The free plan covers 3 accounts.",
    },
  ],
};

export const MEME_VIDEO: StandaloneTool = {
  slug: "meme-video-maker",
  name: "Meme Video Maker",
  metaTitle: "Meme Video Maker: Add a Caption Above Any Clip (Free) | Social0",
  metaDescription:
    "Put a caption bar above your video, the meme format that goes viral on X, Instagram and TikTok. Exports MP4 with sound, in your browser. Free, no signup.",
  intro:
    "Upload a short clip, type the caption and download a meme video with the white caption bar on top, the format that goes viral on X, Instagram Reels and TikTok. It runs in your browser, so your clip is never uploaded.",
  howTo: [
    "Drop in a video up to 60 seconds long.",
    "Type the caption, pick Caption bar, Top & bottom or Subtitle, and set the size.",
    "Press Download. The clip plays through once while it records, then saves as MP4 with sound.",
  ],
  notes: [
    "Use clips you have the right to post. Social0 doesn't host meme templates; you bring your own.",
    "Chrome, Edge and Safari save MP4. Older browsers save WebM, which X, Instagram and TikTok also accept.",
    "Keep this tab open while it records. Free downloads carry a small social0.app badge; sign up free to remove it.",
  ],
  faq: [
    {
      question: "How do I add text above a video for a meme?",
      answer:
        "Upload the clip here, type your caption and download it. The tool adds a white bar on top with your text in bold, sized to fit, and keeps the video and sound underneath.",
    },
    {
      question: "Is the video uploaded to a server?",
      answer: "No. The video is drawn and recorded in your browser and saved straight to your device.",
    },
    {
      question: "Can I schedule the meme to several platforms?",
      answer:
        "Yes. Upload the downloaded video to Social0 and post it to X, Instagram, TikTok, YouTube Shorts and more in one go. The free plan covers 3 accounts.",
    },
  ],
};

export const MEME_IMAGE: StandaloneTool = {
  slug: "meme-generator",
  name: "Meme Generator",
  metaTitle: "Meme Generator: Add Text Anywhere on Your Image (Free) | Social0",
  metaDescription:
    "Free meme maker: upload an image, add as many text boxes as you like, drag them anywhere, change font, colour and outline, and add extra images. JPG or PNG.",
  intro:
    "Upload any image and build your meme: add as many text boxes as you want, drag them anywhere, and style each one with its own font, colour, outline and size. Add more pictures on top, or white space above and below. It all runs in your browser.",
  howTo: [
    "Upload your image (or start from the sample).",
    "Type in the text boxes on the right, add more with + Text, and drag each one into place on the picture.",
    "Press the gear on a text box for font, size, outline, caps and alignment, then download a JPG or PNG.",
  ],
  notes: [
    "Drag the blue corner to resize any text or image. Delete removes the selected one.",
    "Add white space at the top for the caption-bar meme format, then put your text in it.",
    "Use images you have the right to post; Social0 doesn't host meme templates. Free downloads carry a small social0.app badge; sign up free to remove it.",
  ],
  faq: [
    {
      question: "How do I put text anywhere on a meme?",
      answer: "Every text box can be dragged. Click it on the picture and move it, then drag the blue corner to make it bigger or smaller.",
    },
    {
      question: "Can I use the classic Impact meme font?",
      answer: "Yes. New text starts in the classic style: white, all caps, black outline. Switch font per text box between Impact-style, rounded bold, comic, marker and clean.",
    },
    {
      question: "Can I add more than one image?",
      answer: "Yes. Use + Image to place extra pictures on top of the base image, then drag and resize them like text.",
    },
    {
      question: "Is my image uploaded?",
      answer: "No. Everything is drawn in your browser and saved straight to your device.",
    },
  ],
};

export const STANDALONE_TOOLS: StandaloneTool[] = [LINKEDIN_FORMATTER, THREAD_MAKER, MEME_VIDEO, MEME_IMAGE, INSTAGRAM_GRID, INSTAGRAM_CAROUSEL];

export const FORMATTER_SAMPLE = `𝗠𝗼𝘀𝘁 𝗳𝗼𝘂𝗻𝗱𝗲𝗿𝘀 𝗽𝗼𝘀𝘁 𝘁𝗼𝗼 𝗹𝗶𝘁𝘁𝗹𝗲.

I posted every weekday for 30 days. What changed:

• Profile views up
• More DMs from people who could actually buy
• I stopped overthinking each post

The trick was 𝘣𝘢𝘵𝘤𝘩𝘪𝘯𝘨: write five on Monday, schedule them, forget them.

What's stopping you from posting daily?`;

export const THREAD_SAMPLE = `Most founders think they need more features. They usually need more posts. I learned this the hard way after shipping for six months and getting almost no signups.

So I tried something simple. I wrote five posts every Monday morning and scheduled them for the week. No posting on the fly, no guessing what to say each day.

Within a month, profile visits went up and people started replying with real questions. A few of them became customers, and none of them came from a launch.

The lesson: distribution is a habit, not an event. Pick a day, batch your posts, schedule them, and get back to building.`;
