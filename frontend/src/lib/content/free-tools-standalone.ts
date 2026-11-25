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

export const STANDALONE_TOOLS: StandaloneTool[] = [LINKEDIN_FORMATTER];

export const FORMATTER_SAMPLE = `𝗠𝗼𝘀𝘁 𝗳𝗼𝘂𝗻𝗱𝗲𝗿𝘀 𝗽𝗼𝘀𝘁 𝘁𝗼𝗼 𝗹𝗶𝘁𝘁𝗹𝗲.

I posted every weekday for 30 days. What changed:

• Profile views up
• More DMs from people who could actually buy
• I stopped overthinking each post

The trick was 𝘣𝘢𝘵𝘤𝘩𝘪𝘯𝘨: write five on Monday, schedule them, forget them.

What's stopping you from posting daily?`;
