export type AccountLimitResult = {
  currentTotal: number;
  limitTotal: number;
  hasUsedTrial: boolean;
  /** Agency: accounts included before extras are billed (59). */
  includedTotal?: number;
  /** Agency: accounts above `includedTotal` are added to the bill, never blocked. */
  autoBilled?: boolean;
};
