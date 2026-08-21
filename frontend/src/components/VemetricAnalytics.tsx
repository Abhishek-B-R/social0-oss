import { VemetricScript } from "@vemetric/react";
import { VEMETRIC_TOKEN } from "@/lib/vemetric";

/**
 * Product analytics (Vemetric). Pageviews + outbound links; identify happens in-app.
 * Localhost traffic is ignored by Vemetric.
 */
export function VemetricAnalytics() {
  if (!VEMETRIC_TOKEN) return null;

  return (
    <VemetricScript
      token={VEMETRIC_TOKEN}
      trackPageViews
      trackOutboundLinks
      trackDataAttributes
      maskPaths={["/invite/*", "/dashboard/teams/invite/*"]}
    />
  );
}
