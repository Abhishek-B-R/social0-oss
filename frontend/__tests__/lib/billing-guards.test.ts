import { normalizeBillingEmail } from "@/lib/billing-guards";

describe("normalizeBillingEmail", () => {
  it("lowercases and strips Gmail dots and plus aliases", () => {
    expect(normalizeBillingEmail("A.B.C+tag@gmail.com")).toBe("abc@gmail.com");
    expect(normalizeBillingEmail("test@GoogleMail.com")).toBe("test@gmail.com");
  });

  it("strips plus aliases on non-Gmail domains", () => {
    expect(normalizeBillingEmail("user+tag@company.com")).toBe("user@company.com");
  });
});
