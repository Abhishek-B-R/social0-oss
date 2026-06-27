import { useLocation } from "react-router-dom";
import { SeoHead } from "@/components/seo/SeoHead";
import { staticRouteSeo } from "@/lib/page-metadata";

/** Applies per-route title and meta tags for public marketing/auth pages. */
export function RouteSeo() {
  const { pathname } = useLocation();
  const config = staticRouteSeo(pathname);
  if (!config) return null;
  return <SeoHead {...config} />;
}
