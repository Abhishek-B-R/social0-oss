/**
 * Lightweight public contact / operator info for Social0 legal pages.
 * (Indie-style: name + email — no home address / Udyam on the site.)
 */

export const LEGAL_ENTITY = {
  /** Public operator name shown in contact blocks. */
  operatorName: "Abhishek",
  tradingAs: "Social0",
  supportEmail: "support@social0.app",
  legalEmail: "legal@social0.app",
  privacyEmail: "privacy@social0.app",
  twitterUrl: "https://x.com/abhitwt",
  twitterHandle: "@abhitwt",
  paymentProcessor: {
    name: "Dodo Payments",
  },
  website: "https://social0.app",
} as const;
