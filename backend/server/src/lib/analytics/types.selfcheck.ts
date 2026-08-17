/**
 * ponytail: assert helpers used by analytics aggregation.
 * Run: npx tsx backend/server/src/lib/analytics/types.selfcheck.ts
 */
import {
  engagementTotal,
  missingAnalyticsScopes,
  rangeToMs,
  scopeGranted,
  sumMetrics,
} from "./types.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(rangeToMs("7d") === 7 * 24 * 60 * 60 * 1000, "7d ms");
assert(rangeToMs("14d") === 14 * 24 * 60 * 60 * 1000, "14d ms");
assert(rangeToMs("28d") === 28 * 24 * 60 * 60 * 1000, "28d ms");
assert(scopeGranted("a,b,c", "b"), "scopeGranted comma");
assert(scopeGranted("video.list user.info.stats", "video.list"), "scopeGranted space");
assert(!scopeGranted("video.upload", "video.list"), "scopeGranted missing");

assert(
  missingAnalyticsScopes("instagram", "instagram_business_basic").includes(
    "instagram_business_manage_insights",
  ),
  "instagram missing insights",
);
assert(
  missingAnalyticsScopes("twitter_x", "whatever").length === 0,
  "twitter no required analytics scopes",
);
assert(
  missingAnalyticsScopes("instagram", null).includes(
    "instagram_business_manage_insights",
  ),
  "null stored scopes still flags IG insights",
);
assert(
  missingAnalyticsScopes("tiktok", "").includes("video.list"),
  "empty tiktok scopes flags video.list",
);
assert(
  missingAnalyticsScopes("youtube", null).length === 0,
  "youtube not nagged",
);

const sums = sumMetrics([{ likes: 2, views: 10 }, { likes: 3, comments: 1 }]);
assert(sums.likes === 5 && sums.views === 10 && sums.comments === 1, "sumMetrics");
assert(engagementTotal({ likes: 1, comments: 2, shares: 3 }) === 6, "engagementTotal");

console.log("analytics types selfcheck ok");
