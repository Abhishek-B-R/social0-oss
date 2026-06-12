import {
  ALTERNATIVE_SLUGS,
  ALTERNATIVES,
} from "@/lib/content/alternatives";
import { FEATURE_SLUGS, FEATURES } from "@/lib/content/features";

const alternativeSet = new Set(ALTERNATIVE_SLUGS);
const featureSet = new Set(FEATURE_SLUGS);

/** Throws if any cross-links between pSEO pages reference missing slugs. */
export function validatePseoContent(): void {
  const errors: string[] = [];

  for (const feature of FEATURES) {
    for (const slug of feature.relatedAlternativeSlugs) {
      if (!alternativeSet.has(slug)) {
        errors.push(
          `Feature "${feature.slug}" references unknown alternative "${slug}"`,
        );
      }
    }
  }

  for (const alt of ALTERNATIVES) {
    for (const slug of alt.relatedFeatureSlugs) {
      if (!featureSet.has(slug)) {
        errors.push(
          `Alternative "${alt.slug}" references unknown feature "${slug}"`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`pSEO content validation failed:\n${errors.join("\n")}`);
  }
}
