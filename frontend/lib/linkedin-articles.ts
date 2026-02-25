/**
 * LinkedIn Articles (REST Posts API with content.article).
 * Used for blog/long-form posts; requires w_member_social scope.
 * See: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-targeting/version/article-ads-integrations
 */

const LINKEDIN_REST_VERSION = "202506";

/**
 * Upload an image via LinkedIn REST Images API and return urn:li:image:{id}.
 * Used for article thumbnail (optional). Owner must be person URN for member posts.
 */
export async function uploadLinkedInArticleImage(
  imageUrl: string,
  accessToken: string,
  personUrn: string,
): Promise<string> {
  const initRes = await fetch(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Linkedin-Version": LINKEDIN_REST_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: personUrn,
        },
      }),
    },
  );

  if (!initRes.ok) {
    const err = (await initRes.json().catch(() => ({}))) as Record<string, unknown>;
    const msg = (err.message as string) || initRes.statusText;
    throw new Error(`LinkedIn Images API init: ${msg}`);
  }

  const initData = (await initRes.json()) as {
    value?: { uploadUrl?: string; image?: string };
  };
  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;

  if (!uploadUrl || !imageUrn) {
    throw new Error(
      `LinkedIn did not return uploadUrl or image URN: ${JSON.stringify(initData)}`,
    );
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch image: ${imageRes.statusText}`);
  }

  const buffer = Buffer.from(await imageRes.arrayBuffer());
  let contentType = "image/jpeg";
  if (
    imageUrl.includes(".png") ||
    imageUrl.toLowerCase().endsWith(".png")
  ) {
    contentType = "image/png";
  } else if (
    imageUrl.includes(".gif") ||
    imageUrl.toLowerCase().endsWith(".gif")
  ) {
    contentType = "image/gif";
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    throw new Error(`LinkedIn image upload: ${errBody.slice(0, 200) || uploadRes.statusText}`);
  }

  return imageUrn;
}

/**
 * Build the canonical URL for an article (required by LinkedIn as "source").
 * Set LINKEDIN_ARTICLE_SOURCE_BASE or NEXT_PUBLIC_APP_URL so articles link to your app.
 */
export function getLinkedInArticleSourceUrl(postId: string): string {
  const base =
    process.env.LINKEDIN_ARTICLE_SOURCE_BASE ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null);
  if (!base) {
    return `https://example.com/posts/${postId}`;
  }
  const normalized = base.replace(/\/$/, "");
  return `${normalized}/posts/${postId}`;
}

export type PublishLinkedInArticleParams = {
  accessToken: string;
  authorUrn: string;
  title: string;
  description: string;
  sourceUrl: string;
  thumbnailImageUrn?: string | null;
  commentary?: string;
};

/**
 * Publish a LinkedIn Article post via REST Posts API (content.article).
 * Article appears as a native article card with title, description, thumbnail, and source URL.
 */
export async function publishLinkedInArticle(
  params: PublishLinkedInArticleParams,
): Promise<{ postId: string | null; platformPostUrl: string | null }> {
  const {
    accessToken,
    authorUrn,
    title,
    description,
    sourceUrl,
    thumbnailImageUrn,
    commentary,
  } = params;

  const body = {
    author: authorUrn,
    commentary: commentary ?? "",
    visibility: "PUBLIC" as const,
    distribution: {
      feedDistribution: "MAIN_FEED" as const,
      targetEntities: [] as unknown[],
      thirdPartyDistributionChannels: [] as unknown[],
    },
    content: {
      article: {
        source: sourceUrl,
        title: title.slice(0, 400),
        description: description.slice(0, 4086),
        ...(thumbnailImageUrn && { thumbnail: thumbnailImageUrn }),
      },
    },
    lifecycleState: "PUBLISHED" as const,
    isReshareDisabledByAuthor: false,
  };

  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Linkedin-Version": LINKEDIN_REST_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const message = (data.message as string) || res.statusText;
    throw new Error(`LinkedIn Articles API: ${message}`);
  }

  const postId = res.headers.get("x-restli-id") ?? (data.id as string) ?? null;
  const platformPostUrl = postId
    ? `https://www.linkedin.com/feed/update/${postId}`
    : null;

  return { postId, platformPostUrl };
}
