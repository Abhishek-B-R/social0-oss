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
