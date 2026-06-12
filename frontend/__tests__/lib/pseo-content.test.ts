import { generateLlmsTxt } from "@/lib/content/llms";
import { ALTERNATIVE_SLUGS } from "@/lib/content/alternatives";
import { FEATURE_SLUGS } from "@/lib/content/features";
import { validatePseoContent } from "@/lib/content/validate-pseo";

describe("pSEO content", () => {
  it("has valid cross-links between features and alternatives", () => {
    expect(() => validatePseoContent()).not.toThrow();
  });

  it("generates llms.txt with every feature and alternative slug", () => {
    const txt = generateLlmsTxt();

    for (const slug of FEATURE_SLUGS) {
      expect(txt).toContain(`/features/${slug}`);
    }
    for (const slug of ALTERNATIVE_SLUGS) {
      expect(txt).toContain(`/alternatives/${slug}`);
    }
  });

  it("uses unique feature and alternative slugs", () => {
    expect(new Set(FEATURE_SLUGS).size).toBe(FEATURE_SLUGS.length);
    expect(new Set(ALTERNATIVE_SLUGS).size).toBe(ALTERNATIVE_SLUGS.length);
  });
});
