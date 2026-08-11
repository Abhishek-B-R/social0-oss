import type { PageMetadata } from "@/lib/seo";
import Link from "@/components/AppLink";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

export const metadata: PageMetadata = {
  title: "Refund & Cancellation Policy | Social0",
  description:
    "Social0 subscription refund and cancellation policy. Fees are non-refundable except where required by law. Cancel anytime from Billing.",
  alternates: { canonical: "https://social0.app/refund" },
};

const linkClass =
  "text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400 dark:hover:text-emerald-300";

export default function RefundPage() {
  return (
    <div className="landing landing-page min-h-screen flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[22px] text-foreground landing mb-6">
          Refund &amp; Cancellation Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: July 2026
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              1. Cancellation
            </h2>
            <p>
              You may cancel your paid subscription at any time from{" "}
              <Link href="/dashboard/billing" className={linkClass}>
                Billing
              </Link>
              . There are no cancellation fees. After you cancel, you keep
              access to paid features until the end of the current billing
              period (unless your plan states otherwise). Cancellation
              stops future renewals.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              2. Refunds
            </h2>
            <p className="mb-3">
              Subscription fees and other charges for Social0 are{" "}
              <strong>non-refundable</strong>. This includes:
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>Unused time remaining in a billing period after cancellation</li>
              <li>Plan upgrades, downgrades, or interval changes</li>
              <li>Charges you believe were made in error after you authorized payment</li>
              <li>
                Dissatisfaction with the Service or third-party platform
                outages/API changes
              </li>
            </ul>
            <p className="mb-3">
              We do <strong>not</strong> offer a standing “refund within X hours”
              window. Where applicable law requires a refund or cooling-off
              right, we will honor that legal requirement.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              3. Taxes
            </h2>
            <p>
              Plan prices are generally shown tax-exclusive. Applicable GST or
              other taxes are added at checkout and/or on invoices from{" "}
              {LEGAL_ENTITY.paymentProcessor.name}. Tax amounts charged are
              treated the same as the underlying fee for refund purposes, except
              where tax law requires a different outcome.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              4. How to request a legally required refund
            </h2>
            <p>
              If you believe applicable law entitles you to a refund, email{" "}
              <a
                href={`mailto:${LEGAL_ENTITY.supportEmail}`}
                className={linkClass}
              >
                {LEGAL_ENTITY.supportEmail}
              </a>{" "}
              with your account email, invoice/payment reference, and the legal
              basis for your request. We will review and respond within a
              reasonable time.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              5. Related documents
            </h2>
            <p>
              This policy is part of our{" "}
              <Link href="/terms" className={linkClass}>
                Terms of Service
              </Link>
              . Privacy practices are described in our{" "}
              <Link href="/privacy" className={linkClass}>
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
