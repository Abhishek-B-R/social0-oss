import { db } from "../db/index.js";
import { legalAcceptances } from "../db/schema.js";
import {
  LEGAL_VERSIONS,
  type LegalDocumentType,
} from "@social0/shared";
import { and, desc, eq } from "drizzle-orm";

const REQUIRED_DOCS: LegalDocumentType[] = ["terms", "privacy"];

export type LegalStatus = {
  needsAcceptance: boolean;
  requiredVersions: typeof LEGAL_VERSIONS;
  accepted: Partial<Record<LegalDocumentType, { version: string; acceptedAt: string }>>;
  marketingOptIn: boolean;
};

async function latestAcceptance(
  userId: string,
  documentType: LegalDocumentType,
) {
  const [row] = await db
    .select({
      version: legalAcceptances.version,
      acceptedAt: legalAcceptances.acceptedAt,
    })
    .from(legalAcceptances)
    .where(
      and(
        eq(legalAcceptances.userId, userId),
        eq(legalAcceptances.documentType, documentType),
      ),
    )
    .orderBy(desc(legalAcceptances.acceptedAt))
    .limit(1);
  return row;
}

export async function getLegalStatus(userId: string): Promise<LegalStatus> {
  const [terms, privacy, marketing] = await Promise.all(
    (["terms", "privacy", "marketing"] as const).map((t) =>
      latestAcceptance(userId, t),
    ),
  );

  const accepted: LegalStatus["accepted"] = {};
  if (terms) {
    accepted.terms = {
      version: terms.version,
      acceptedAt: terms.acceptedAt.toISOString(),
    };
  }
  if (privacy) {
    accepted.privacy = {
      version: privacy.version,
      acceptedAt: privacy.acceptedAt.toISOString(),
    };
  }
  if (marketing) {
    accepted.marketing = {
      version: marketing.version,
      acceptedAt: marketing.acceptedAt.toISOString(),
    };
  }

  const needsAcceptance = REQUIRED_DOCS.some(
    (doc) => accepted[doc]?.version !== LEGAL_VERSIONS[doc],
  );

  return {
    needsAcceptance,
    requiredVersions: LEGAL_VERSIONS,
    accepted,
    marketingOptIn:
      marketing?.version === LEGAL_VERSIONS.marketing &&
      marketing != null,
  };
}

export type RecordLegalInput = {
  userId: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  marketingOptIn?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function recordLegalAcceptances(
  input: RecordLegalInput,
): Promise<void> {
  if (!input.acceptTerms || !input.acceptPrivacy) {
    throw new Error("LEGAL_CONSENT_REQUIRED");
  }

  const rows: (typeof legalAcceptances.$inferInsert)[] = [
    {
      userId: input.userId,
      documentType: "terms",
      version: LEGAL_VERSIONS.terms,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
    {
      userId: input.userId,
      documentType: "privacy",
      version: LEGAL_VERSIONS.privacy,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  ];

  if (input.marketingOptIn) {
    rows.push({
      userId: input.userId,
      documentType: "marketing",
      version: LEGAL_VERSIONS.marketing,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  await db.insert(legalAcceptances).values(rows);
}

export function validateSignupLegalConsent(body: {
  acceptTerms?: boolean;
  acceptPrivacy?: boolean;
}): string | null {
  if (!body.acceptTerms || !body.acceptPrivacy) {
    return "You must accept the Terms of Service and acknowledge the Privacy Policy.";
  }
  return null;
}
