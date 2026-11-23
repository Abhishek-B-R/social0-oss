/**
 * Small helpers shared by the billing page: error copy and the Dodo preview
 * amount formatter. Kept out of the components so the flows read top-down.
 */

export const PAYMENT_DECLINED_MESSAGE =
  "Your payment could not be processed. Check your card details or try a different payment method.";

/** Turns provider error codes into plain copy; anything unknown → `fallback`. */
export function toFriendlyBillingError(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (
    normalized.includes("generic_decline") ||
    normalized.includes("payment_declined") ||
    normalized.includes("declined")
  ) {
    return PAYMENT_DECLINED_MESSAGE;
  }
  return fallback;
}

/** Dodo preview summary: `currency`/`total_amount` = customer charge (may be INR); `settlement_*` = merchant settlement (often USD). */
export type PreviewChargeSummary = {
  total_amount?: number;
  totalAmount?: number;
  currency?: string;
  settlement_amount?: number;
  settlementAmount?: number;
  settlement_currency?: string;
  settlementCurrency?: string;
};

function normalizePreviewSummary(raw: PreviewChargeSummary): {
  totalMinor: number;
  currency: string;
  settlementMinor?: number;
  settlementCurrency?: string;
} {
  const totalMinor =
    typeof raw.total_amount === "number"
      ? raw.total_amount
      : typeof raw.totalAmount === "number"
        ? raw.totalAmount
        : 0;
  const currency =
    typeof raw.currency === "string" && raw.currency.trim()
      ? raw.currency.trim()
      : "usd";
  const settlementMinor =
    typeof raw.settlement_amount === "number"
      ? raw.settlement_amount
      : typeof raw.settlementAmount === "number"
        ? raw.settlementAmount
        : undefined;
  const settlementCurrencyRaw =
    typeof raw.settlement_currency === "string"
      ? raw.settlement_currency
      : typeof raw.settlementCurrency === "string"
        ? raw.settlementCurrency
        : undefined;
  return {
    totalMinor,
    currency,
    settlementMinor,
    settlementCurrency: settlementCurrencyRaw?.trim() || undefined,
  };
}

/** Show USD when Dodo reports settlement in USD (local charge may still be INR). */
export function formatPreviewAmount(raw: PreviewChargeSummary): string {
  const s = normalizePreviewSummary(raw);
  const c = (code: string) => code.toUpperCase();
  if (
    typeof s.settlementMinor === "number" &&
    s.settlementCurrency &&
    c(s.settlementCurrency) === "USD"
  ) {
    return `$${(s.settlementMinor / 100).toFixed(2)}`;
  }
  const cur = c(s.currency);
  const amount = (s.totalMinor / 100).toFixed(2);
  return cur === "USD" ? `$${amount}` : `${cur} ${amount}`;
}

/** POST JSON to a billing endpoint; never throws on a bad body. */
export async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
