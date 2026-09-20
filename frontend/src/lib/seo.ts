import { getAppUrl } from "./env";

export type PageMetadata = Record<string, unknown>;

export const siteUrl = getAppUrl();

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl.replace(/\/$/, "")}${normalized}`;
}

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
};

export function buildPageMetadata({
  title,
  description,
  path,
  keywords,
}: PageMetadataInput): PageMetadata {
  const url = absoluteUrl(path);

  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: "Social0",
      type: "website",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.jpg"],
      creator: "@social0_app",
    },
  };
}

export function buildFaqJsonLd(
  faqs: readonly { question: string; answer: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function buildWebPageJsonLd(input: {
  name: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    isPartOf: {
      "@type": "WebSite",
      name: "Social0",
      url: siteUrl,
    },
  };
}

export function buildBreadcrumbJsonLd(
  items: readonly { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function buildItemListJsonLd(
  items: readonly { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

export function buildBlogPostingJsonLd(input: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  keywords?: readonly string[];
  /** Rounded reading time in minutes. */
  readingMinutes?: number;
}) {
  const url = absoluteUrl(input.path);

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    inLanguage: "en",
    image: absoluteUrl("/og-image.jpg"),
    keywords: input.keywords?.join(", "),
    timeRequired: input.readingMinutes
      ? `PT${input.readingMinutes}M`
      : undefined,
    author: {
      "@type": "Organization",
      name: "Social0",
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "Social0",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/og-image.jpg"),
      },
    },
  };
}

export function buildBlogJsonLd(
  posts: readonly { title: string; description: string; path: string; datePublished: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Social0 Blog",
    url: absoluteUrl("/blog"),
    description:
      "Platform specs, publishing strategy, and engineering notes on multi-platform social media publishing.",
    publisher: {
      "@type": "Organization",
      name: "Social0",
      url: siteUrl,
    },
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      url: absoluteUrl(post.path),
      datePublished: post.datePublished,
    })),
  };
}

export function buildSoftwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Social0",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description:
      "Multi-platform social media scheduler with AI agent support. Compose once and publish to X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest — via dashboard, MCP, API, or CLI.",
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      description: "Free plan and paid tiers for creators and teams",
    },
    featureList: [
      "Multi-platform scheduling",
      "Compose once, publish everywhere",
      "AI agents via MCP, API, and CLI",
      "Content calendar",
      "Drafts and bulk scheduling tools",
      "OAuth-secured account connections",
    ],
  };
}

export const homePageTitle =
  "Social0 — AI Agents & Multi-Platform Social Scheduling";

export const homePageDescription =
  "Publish and schedule across 9 platforms from one dashboard — or let ChatGPT, Claude, and your agents ship via MCP, API, and CLI. Start free.";

export function buildHomeMetadata(path: "/" | "/home" = "/"): PageMetadata {
  const url = absoluteUrl(path);
  const canonical = absoluteUrl("/");

  return {
    title: homePageTitle,
    description: homePageDescription,
    keywords: [
      "social media scheduler",
      "AI social media agent",
      "MCP social media",
      "ChatGPT social media",
      "Claude social publishing",
      "schedule tweets",
      "instagram scheduler",
      "tiktok scheduler",
      "social media publishing",
      "buffer alternative",
      "threads scheduler",
      "bluesky scheduling tool",
    ],
    alternates: { canonical },
    robots:
      path === "/home"
        ? { index: false, follow: true }
        : { index: true, follow: true },
    openGraph: {
      title: homePageTitle,
      description:
        "One dashboard for 9 platforms — plus MCP, API, and CLI so your AI agents can publish too.",
      url,
      siteName: "Social0",
      type: "website",
      images: [
        {
          url: absoluteUrl("/og-image.jpg"),
          width: 1200,
          height: 630,
          alt: "Social0 — schedule everywhere or let AI agents publish",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: homePageTitle,
      description:
        "One dashboard for 9 platforms — plus MCP, API, and CLI so your AI agents can publish too.",
      images: [absoluteUrl("/og-image.jpg")],
      creator: "@social0_app",
    },
  };
}

export function buildHomeJsonLd(path: "/" | "/home" = "/") {
  return [
    buildWebPageJsonLd({
      name: homePageTitle,
      description: homePageDescription,
      path,
    }),
    buildSoftwareApplicationJsonLd(),
    buildOrganizationJsonLd(),
  ];
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Social0",
    url: siteUrl,
    logo: absoluteUrl("/og-image.jpg"),
    sameAs: [
      "https://x.com/social0_app",
      "https://www.linkedin.com/company/social0/",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: "support@social0.app",
      contactType: "customer support",
      url: absoluteUrl("/contact"),
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: "IN",
    },
  };
}
