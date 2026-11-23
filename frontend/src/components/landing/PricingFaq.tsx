import { useState } from "react";
import {
  AGENCY_INCLUDED_ACCOUNTS,
  CREATOR_ACCOUNTS,
  PLAN_NAMES,
} from "@/lib/plans";

const { creator: CREATOR, agency: AGENCY } = PLAN_NAMES;

const PRICING_FAQS = [
  {
    q: "What counts as an account?",
    a: "Each connected social profile counts once. Your Instagram and your client's Instagram are 2 accounts; one LinkedIn profile and one LinkedIn page are 2 accounts.",
  },
  {
    q: `What's the difference between ${CREATOR} and ${AGENCY}?`,
    a: `${CREATOR} is $29.90/month for up to ${CREATOR_ACCOUNTS} accounts. ${AGENCY} is $59.90/month with ${AGENCY_INCLUDED_ACCOUNTS} accounts included, then $1/month per extra account with no cap, plus teammates, shared workspaces and higher API limits (5,000 requests/hour vs 1,000). Everything else, from all 9 networks to bulk tools, auto-repost and auto-plug, is on both.`,
  },
  {
    q: "Is there a free plan?",
    a: "Yes. Free includes 3 connected accounts and 10 posts so you can try Social0 before upgrading. No credit card required.",
  },
  {
    q: "How does yearly billing work?",
    a: `Yearly is 10 times the monthly price, so you get 2 months free: ${CREATOR} is $299/year and ${AGENCY} is $599/year, plus $10/year per extra ${AGENCY} account.`,
  },
  {
    q: "What happens if I go over my account limit?",
    a: `On ${AGENCY}, nothing stops you: connect as many accounts as you need. Each one over ${AGENCY_INCLUDED_ACCOUNTS} adds $1/month ($10/year on yearly) to your bill automatically, charged pro rata for the rest of the billing period. Disconnect one and your next bill drops by the same amount (no mid-cycle refunds). On ${CREATOR}, which holds ${CREATOR_ACCOUNTS} accounts, connecting a 16th offers a one-click move to ${AGENCY}. Free holds 3 accounts.`,
  },
  {
    q: "I'm on Starter, Growth, Pro or Max. What changes?",
    a: `Nothing, unless you want it to. You keep your plan, its limits and its price for as long as you stay subscribed. You can switch to ${CREATOR} or ${AGENCY} from Billing anytime.`,
  },
  {
    q: "Do all plans include API, MCP, and CLI?",
    a: "Yes. Every plan, Free included, gets the REST API, remote MCP, and official CLI, on the same publish engine as the dashboard.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts and no cancellation fees. Cancel anytime from Billing; you keep access until the end of the current billing period.",
  },
  {
    q: "Can I get a refund?",
    a: "Subscription fees are non-refundable except where required by law. Cancel anytime to stop renewals — see /refund. Questions? Email support@social0.app.",
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
          <h2 className="font-sans text-[clamp(28px,4vw,40px)] font-bold leading-tight tracking-tight text-[#333C4D] dark:text-white">
            Pricing questions, answered
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
