import { useState } from "react";

const PRICING_FAQS = [
  {
    q: "Is there a free plan?",
    a: "Yes. Free includes 3 connected accounts and 10 posts so you can try Social0 before upgrading. No credit card required.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts and no cancellation fees. Cancel anytime from Billing; you keep access until the end of the current billing period.",
  },
  {
    q: "Can I get a refund?",
    a: "Subscription fees are non-refundable except where required by law. Cancel anytime to stop renewals — see /refund. Questions? Email support@social0.app.",
  },
  {
    q: "Do all plans include API, MCP, and CLI?",
    a: "Yes. Free, Starter, Growth, and Pro all include the REST API, remote MCP, and official CLI — same publish engine as the dashboard.",
  },
  {
    q: "What’s the difference between Growth and Pro?",
    a: "Growth is built for serious solo creators and small brands (15 accounts, automation, bulk tools). Pro adds up to 50 accounts, team invites, and priority support.",
  },
  {
    q: "What happens if I go over my account limit?",
    a: "Extra connected accounts stay linked but inactive until you upgrade or disconnect one. You never lose the connection — you just pause publishing from over-limit slots.",
  },
] as const;

/** Billing FAQs for /pricing — framework section after comparison. */
export function PricingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="pricing-faq"
      className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      aria-label="Pricing FAQ"
    >
      <div className="mx-auto max-w-[800px]">
        <div className="mb-10 text-center">
          <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            FAQ
          </p>
          <h2 className="font-serif text-[clamp(28px,4vw,40px)] italic leading-tight text-muted-foreground">
            Pricing questions, answered.
          </h2>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
          <div className="divide-y divide-border overflow-hidden rounded-[22px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111]">
            {PRICING_FAQS.map((faq, i) => {
              const open = openIndex === i;
              return (
                <div key={faq.q}>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : i)}
                    aria-expanded={open}
                    className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left md:px-8"
                  >
                    <span className="text-[15px] font-medium text-foreground">
                      {faq.q}
                    </span>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-lg text-muted-foreground transition-transform duration-200 dark:bg-muted/60 ${open ? "rotate-45" : ""}`}
                    >
                      +
                    </span>
                  </button>
                  {open ? (
                    <p className="px-6 pb-5 pr-10 text-[14px] leading-relaxed text-muted-foreground md:px-8">
                      {faq.a}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
