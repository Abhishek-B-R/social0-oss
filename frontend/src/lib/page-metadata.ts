import {
  absoluteUrl,
  buildHomeMetadata,
  buildPageMetadata,
  homePageDescription,
  homePageTitle,
} from "@/lib/seo";

export type RobotsDirective = {
  index?: boolean;
  follow?: boolean;
};

export type PageSeoConfig = {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  canonical?: string;
  robots?: RobotsDirective;
  openGraph?: {
    title?: string;
    description?: string;
    type?: string;
    image?: string;
  };
  twitter?: {
    title?: string;
    description?: string;
    image?: string;
  };
};

function robotsContent(robots: RobotsDirective | undefined): string | undefined {
  if (!robots) return undefined;
  const index = robots.index === false ? "noindex" : "index";
  const follow = robots.follow === false ? "nofollow" : "follow";
  return `${index}, ${follow}`;
}

/** Flatten Next-style metadata objects from marketing pages into SeoHead props. */
export function metadataToSeoConfig(
  metadata: Record<string, unknown>,
  fallbackPath: string,
): PageSeoConfig {
  const title = typeof metadata.title === "string" ? metadata.title : "Social0";
  const description =
    typeof metadata.description === "string" ? metadata.description : "";
  const keywords = Array.isArray(metadata.keywords)
    ? metadata.keywords.filter((k): k is string => typeof k === "string")
    : undefined;

  const alternates = metadata.alternates as { canonical?: string } | undefined;
  const canonical =
    typeof alternates?.canonical === "string"
      ? alternates.canonical
      : absoluteUrl(fallbackPath);

  const robotsRaw = metadata.robots as RobotsDirective | undefined;
  const openGraph = metadata.openGraph as PageSeoConfig["openGraph"] | undefined;
  const twitter = metadata.twitter as PageSeoConfig["twitter"] | undefined;

  return {
    title,
    description,
    path: fallbackPath,
    keywords,
    canonical,
    robots: robotsRaw,
    openGraph,
    twitter,
  };
}

export function seoConfigToHelmetProps(config: PageSeoConfig) {
  const canonical = config.canonical ?? (config.path ? absoluteUrl(config.path) : undefined);
  const ogTitle = config.openGraph?.title ?? config.title;
  const ogDescription = config.openGraph?.description ?? config.description;
  const ogImage = config.openGraph?.image ?? absoluteUrl("/og-image.jpg");
  const twitterTitle = config.twitter?.title ?? ogTitle;
  const twitterDescription = config.twitter?.description ?? ogDescription;
  const twitterImage = config.twitter?.image ?? ogImage;

  return {
    title: config.title,
    meta: [
      { name: "description", content: config.description },
      ...(config.keywords?.length
        ? [{ name: "keywords", content: config.keywords.join(", ") }]
        : []),
      ...(robotsContent(config.robots)
        ? [{ name: "robots", content: robotsContent(config.robots)! }]
        : []),
      { property: "og:title", content: ogTitle },
      { property: "og:description", content: ogDescription },
      { property: "og:type", content: config.openGraph?.type ?? "website" },
      ...(canonical ? [{ property: "og:url", content: canonical }] : []),
      { property: "og:site_name", content: "Social0" },
      { property: "og:image", content: ogImage },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@social0_app" },
      { name: "twitter:title", content: twitterTitle },
      { name: "twitter:description", content: twitterDescription },
      { name: "twitter:image", content: twitterImage },
    ],
    link: canonical ? [{ rel: "canonical", href: canonical }] : [],
  };
}

const homeMeta = buildHomeMetadata("/");
export const homeSeo = metadataToSeoConfig(
  homeMeta as Record<string, unknown>,
  "/",
);

export const authSeo: PageSeoConfig = {
  title: "Sign in | Social0",
  description:
    "Sign in or create a Social0 account to schedule and publish to X, Instagram, LinkedIn, TikTok, YouTube, and more from one dashboard.",
  path: "/auth",
  canonical: absoluteUrl("/auth"),
  robots: { index: false, follow: false },
};

export const dashboardSeo: PageSeoConfig = {
  title: "Dashboard | Social0",
  description: homePageDescription,
  robots: { index: false, follow: false },
};

export function staticRouteSeo(pathname: string): PageSeoConfig | null {
  switch (pathname) {
    case "/":
      return homeSeo;
    case "/home":
      return metadataToSeoConfig(
        buildHomeMetadata("/home") as Record<string, unknown>,
        "/home",
      );
    case "/auth":
      return authSeo;
    case "/auth/forgot-password":
      return {
        ...authSeo,
        title: "Reset password | Social0",
        path: "/auth/forgot-password",
        canonical: absoluteUrl("/auth/forgot-password"),
      };
    case "/auth/reset-password":
      return {
        ...authSeo,
        title: "Set new password | Social0",
        path: "/auth/reset-password",
        canonical: absoluteUrl("/auth/reset-password"),
      };
    case "/auth/verify-email":
      return {
        ...authSeo,
        title: "Verify email | Social0",
        path: "/auth/verify-email",
        canonical: absoluteUrl("/auth/verify-email"),
      };
    case "/terms":
      return metadataToSeoConfig(
        {
          title: "Terms of Service | Social0",
          description:
            "Read the Social0 terms of service. Understand your rights and responsibilities when using our social media scheduling and publishing platform.",
          alternates: { canonical: absoluteUrl("/terms") },
        },
        "/terms",
      );
    case "/privacy":
      return metadataToSeoConfig(
        {
          title: "Privacy Policy | Social0",
          description:
            "Social0 privacy policy. Learn how we collect, use, and protect your data when you use our social media scheduling platform.",
          alternates: { canonical: absoluteUrl("/privacy") },
        },
        "/privacy",
      );
    case "/data-deletion":
      return metadataToSeoConfig(
        {
          title: "Data Deletion | Social0",
          description:
            "How to request deletion of your Social0 account data in compliance with platform policies.",
          alternates: { canonical: absoluteUrl("/data-deletion") },
        },
        "/data-deletion",
      );
    case "/features":
      return metadataToSeoConfig(
        buildPageMetadata({
          title: `${homePageTitle} — Platform features`,
          description:
            "Explore Social0 features for scheduling and publishing to X, Instagram, LinkedIn, TikTok, YouTube, Pinterest, Bluesky, Threads, and Facebook.",
          path: "/features",
        }) as Record<string, unknown>,
        "/features",
      );
    case "/alternatives":
      return metadataToSeoConfig(
        buildPageMetadata({
          title: "Social0 alternatives and comparisons",
          description:
            "Compare Social0 with Buffer, Hootsuite, Later, and other social media schedulers.",
          path: "/alternatives",
        }) as Record<string, unknown>,
        "/alternatives",
      );
    case "/mcp":
      return metadataToSeoConfig(
        buildPageMetadata({
          title: "Social0 MCP Server — Manage social media from your AI",
          description:
            "Connect Claude, Cursor, or VS Code to Social0 with the official MCP server. Publish, schedule, and track posts across every platform from natural language.",
          path: "/mcp",
        }) as Record<string, unknown>,
        "/mcp",
      );
    default:
      if (pathname.startsWith("/onboarding")) {
        return {
          ...dashboardSeo,
          title: "Onboarding | Social0",
          path: pathname,
        };
      }
      return null;
  }
}
