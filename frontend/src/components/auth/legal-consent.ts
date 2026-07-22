export type LegalConsentValues = {
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  marketingOptIn: boolean;
};

export const EMPTY_LEGAL_CONSENT: LegalConsentValues = {
  acceptTerms: false,
  acceptPrivacy: false,
  marketingOptIn: false,
};
