/** Current published legal document versions — bump when Terms/Privacy change. */
export const LEGAL_VERSIONS = {
  terms: "1.0",
  privacy: "1.0",
  marketing: "1.0",
} as const;

export type LegalDocumentType = keyof typeof LEGAL_VERSIONS;
