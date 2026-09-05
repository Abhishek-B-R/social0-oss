/**
 * Coverage flags on an analytics overview.
 *
 * `sampled` and `partial` answer different questions and must stay
 * independent: `sampled` says the *publication list* was capped at the page
 * limit (there are more posts in the window than we read), `partial` says
 * the *live request budget* ran out before every publication in that list
 * answered. Folding one into the other made a cold request print "showing
 * the latest N publications" when only three existed, and a warm retry of
 * the same window flip the flag back - readers could not tell which caveat
 * actually applied.
 */
export type AnalyticsCoverage = {
  sampled: boolean;
  partial: boolean;
  sampleLimit: number;
};

export function analyticsCoverage(input: {
  publicationCount: number;
  limit: number;
  partial: boolean;
}): AnalyticsCoverage {
  return {
    sampled: input.publicationCount >= input.limit,
    partial: input.partial,
    sampleLimit: input.limit,
  };
}
