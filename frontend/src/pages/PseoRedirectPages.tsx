import { Navigate, useLocation, useParams } from "react-router-dom";
import { ALTERNATIVE_SLUGS } from "@/lib/content/alternatives";

/** 301-equivalent client redirect: /alternative-to-:slug -> /alternatives/:slug */
export function AlternativeToRedirect() {
  const { slug = "" } = useParams();
  if (ALTERNATIVE_SLUGS.includes(slug)) {
    return <Navigate to={`/alternatives/${slug}`} replace />;
  }
  const aliases: Record<string, string> = { "post-bridge": "postbridge" };
  const canonical = aliases[slug];
  if (canonical && ALTERNATIVE_SLUGS.includes(canonical)) {
    return <Navigate to={`/alternatives/${canonical}`} replace />;
  }
  return <Navigate to="/alternatives" replace />;
}

const FEATURE_ROOT_ALIASES: Record<string, string> = {
  "social-media-scheduler": "multi-platform-scheduler",
  "bluesky-scheduler": "bluesky-scheduling-tool",
  "x-scheduler": "twitter-scheduler",
  "twitter-scheduler": "twitter-scheduler",
  "instagram-scheduler": "instagram-scheduler",
  "linkedin-scheduler": "linkedin-scheduler",
  "tiktok-scheduler": "tiktok-scheduler",
  "youtube-scheduler": "youtube-scheduler",
  "pinterest-scheduler": "pinterest-scheduler",
  "facebook-scheduler": "facebook-scheduler",
  "threads-scheduler": "threads-scheduler",
  "social-media-calendar": "social-media-calendar",
};

/** Client redirect for root platform scheduler URLs (-> /features/*). */
export function FeatureRootRedirect() {
  const slug = useLocation().pathname.replace(/^\//, "");
  const featureSlug = FEATURE_ROOT_ALIASES[slug];
  if (featureSlug) {
    return <Navigate to={`/features/${featureSlug}`} replace />;
  }
  return <Navigate to="/features" replace />;
}
