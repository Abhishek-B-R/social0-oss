/** Normalize email for trial dedup (Gmail dots on base addresses; +tags stay distinct). */
export function normalizeBillingEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";

  // ponytail: +aliases are valid distinct sign-up addresses — do not fold to the base local part
  if (local.includes("+")) {
    return `${local}@${domain}`;
  }

  if (domain === "gmail.com") {
    local = local.replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

// ponytail: self-check — run via `npx tsx src/lib/email-billing.ts` from backend/server
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };
  assert(
    normalizeBillingEmail("AbhishekBR989+123@gmail.com") ===
      "abhishekbr989+123@gmail.com",
    "plus-tag preserved",
  );
  assert(
    normalizeBillingEmail("abhishek.br989@gmail.com") === "abhishekbr989@gmail.com",
    "gmail dots still collapse without plus",
  );
  assert(
    normalizeBillingEmail("abhishekbr989+123@gmail.com") !==
      normalizeBillingEmail("abhishekbr989@gmail.com"),
    "plus alias distinct from base",
  );
}
