/** Current published legal document versions - bump when Terms/Privacy change. */
export const LEGAL_VERSIONS = {
  terms: "2.0",
  privacy: "2.0",
  marketing: "1.0",
} as const;

export type LegalDocumentType = keyof typeof LEGAL_VERSIONS;

/**
 * When terms/privacy versions change, cron `notify-legal-update` emails users
 * once per this notification key. Bump alongside LEGAL_VERSIONS.terms/privacy.
 */
export const LEGAL_UPDATE_NOTIFICATION_KEY = "terms-privacy-2.0";

