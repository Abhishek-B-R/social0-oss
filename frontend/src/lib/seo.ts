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

export function buildSoftwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Social0",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description:
      "Multi-platform social media scheduler. Compose once and publish to X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest.",
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      description: "Paid plans with a 3-day free trial",
    },
    featureList: [
      "Multi-platform scheduling",
      "Compose once, publish everywhere",
      "Content calendar",
      "Drafts and bulk scheduling tools",
      "OAuth-secured account connections",
    ],
  };
}

export const homePageTitle =
  "Social0 - Post and Schedule to All Your Socials from One Place";

export const homePageDescription =
  "Social0 lets you write once and publish everywhere. Schedule posts to Twitter, Instagram, LinkedIn, TikTok, YouTube, Pinterest, Bluesky, Threads, and Facebook from one dashboard. 3-day free trial.";

export function buildHomeMetadata(path: "/" | "/home" = "/"): PageMetadata {
  const url = absoluteUrl(path);
  const canonical = absoluteUrl("/");

  return {
    title: homePageTitle,
    description: homePageDescription,
    keywords: [
      "social media scheduler",
      "social media management",
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
        "Write once. Publish everywhere. Schedule posts to 9 platforms from one dashboard.",
      url,
      siteName: "Social0",
      type: "website",
      images: [
        {
          url: absoluteUrl("/og-image.jpg"),
          width: 1200,
          height: 630,
          alt: "Social0 - Social Media Scheduling Dashboard",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: homePageTitle,
      description:
        "Write once. Publish everywhere. Schedule posts to 9 platforms from one dashboard.",
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
    sameAs: ["https://x.com/social0_app"],
    contactPoint: {
      "@type": "ContactPoint",
      email: "support@social0.app",
      contactType: "customer support",
    },
  };
}
