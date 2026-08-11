import type { PageMetadata } from "@/lib/seo";
import Link from "@/components/AppLink";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { DOCS_TERMS_URL } from "@/lib/docs-url";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

export const metadata: PageMetadata = {
  title: "Terms of Service | Social0 - Social Media Scheduling Tool",
  description:
    "Read the Social0 terms of service. Understand your rights and responsibilities when using our social media scheduling and publishing platform.",
  alternates: { canonical: "https://social0.app/terms" },
};

const linkClass =
  "text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400 dark:hover:text-emerald-300";

export default function TermsPage() {
  return (
    <div className="landing landing-page min-h-screen flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <a
          href={DOCS_TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-20 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
          title="Documentation for this page"
          aria-label="Documentation for this page"
        >
          <svg
            className="w-4 h-4"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        </a>
        <h1 className="text-2xl sm:text-3xl font-bold font-serif text-[22px]  text-foreground landing mb-8">
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: July 2026 · Version 2.0
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              1. Acceptance of terms
            </h2>
            <p>
              By accessing or using Social0 (“Service”), you agree to these Terms
              of Service (“Terms”). If you’re not comfortable with them, you’re
              welcome to stop using the Service anytime.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              2. Description of service
            </h2>
            <p>
              Social0 is a social media management platform that allows you to
              connect your social media accounts, create content, and schedule
              or publish posts across multiple platforms (including LinkedIn,
              Instagram, YouTube, Pinterest, TikTok, X, Threads, Bluesky, and
              Facebook) from one dashboard, and also via LLMs through our MCP
              server or CLI.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              3. Eligibility
            </h2>
            <p>
              You must be at least 13 years old, or the minimum age required in
              your jurisdiction to use online services and connect to social
              media platforms, whichever is higher. By using the Service, you
              represent that you meet this requirement. The Service is not
              directed to children under 13. See also our{" "}
              <Link href="/privacy" className={linkClass}>
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              4. Account and third-party connections
            </h2>
            <p className="mb-3">
              You may sign in with a third-party provider (e.g. Google) or email
              credentials. When you connect a social platform to Social0, we use
              that platform’s official OAuth (or equivalent) flow. You authorize
              us to access only the permissions (scopes) necessary to publish
              and manage content on your behalf. We do not store your social
              network passwords. Access tokens we receive are stored securely;
              we request only the minimum scopes required for posting and
              related functionality. You may disconnect any connected account at
              any time from your dashboard.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of your
              account credentials and for all activity under your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              5. YouTube and Google services
            </h2>
            <p className="mb-3">
              If you use Social0 to connect to, upload to, or otherwise interact
              with YouTube, you agree to be bound by the{" "}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                YouTube Terms of Service
              </a>
              . By connecting a YouTube account via Social0, you also
              acknowledge Google’s privacy practices as described in the{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                Google Privacy Policy
              </a>
              .
            </p>
            <p>
              Our use of data received from Google APIs (including YouTube) is
              further described in our Privacy Policy and complies with the
              Google API Services User Data Policy, including Limited Use
              requirements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              6. Your content, conduct, and copyright
            </h2>
            <p className="mb-3">
              You are responsible for the content you create and publish through
              the Service. You represent and warrant that you own or have the
              necessary rights, licenses, and permissions to any content you
              upload, create, or publish through the Service, including text,
              images, video, and other media.
            </p>
            <p className="mb-3">
              You must comply with each platform’s terms and policies and with
              applicable law. You may not use the Service for spam,
              impersonation, infringement of others’ intellectual property, or
              illegal activity. We may suspend or terminate access if we
              reasonably believe you have violated these Terms or any platform
              policies.
            </p>
            <p>
              If you believe content on the Service infringes your copyright,
              contact us at{" "}
              <a href={`mailto:${LEGAL_ENTITY.legalEmail}`} className={linkClass}>
                {LEGAL_ENTITY.legalEmail}
              </a>{" "}
              with sufficient detail to identify the material and your claim. We
              may remove content that we reasonably believe infringes
              third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              7. Subscriptions, billing, taxes, and refunds
            </h2>
            <p className="mb-3">
              Some features require a paid subscription. Subscription fees are
              billed in advance on a recurring basis according to the plan and
              billing interval you select. Prices and billing intervals are
              shown at checkout and on the Billing page.
            </p>
            <p className="mb-3">
              <strong>Taxes (GST).</strong> Plan prices displayed on Social0
              are tax-exclusive unless we expressly state otherwise. Where GST
              or other applicable taxes apply, they are calculated and charged
              in addition to the plan price at checkout and/or on invoices from{" "}
              {LEGAL_ENTITY.paymentProcessor.name}. The final amount payable,
              including tax, is shown before you confirm payment.
            </p>
            <p className="mb-3">
              <strong>Payment processing.</strong> Card and subscription charges
              are processed by {LEGAL_ENTITY.paymentProcessor.name}. Social0 does
              not store your full card number or CVV.
            </p>
            <p className="mb-3">
              <strong>Refunds.</strong> Subscription fees are{" "}
              <strong>non-refundable</strong>, including for unused time in a
              billing period, plan changes, or early cancellation, except where
              a refund is required by applicable law. There is no free
              customer-facing refund window after a successful charge. See our{" "}
              <Link href="/refund" className={linkClass}>
                Refund &amp; Cancellation Policy
              </Link>{" "}
              for details.
            </p>
            <p className="mb-3">
              You may cancel your subscription at any time from Billing. After
              cancellation, paid features remain available until the end of the
              current billing period (unless we state otherwise at checkout).
              Cancellation stops future renewals; it does not by itself entitle
              you to a refund of amounts already paid.
            </p>
            <p>
              We may change subscription prices or plans. If a price change
              applies to your existing subscription, we will provide notice as
              required by law (including by email where appropriate) before it
              takes effect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              8. Data handling and security
            </h2>
            <p>
              We process and store data as described in our{" "}
              <Link href="/privacy" className={linkClass}>
                Privacy Policy
              </Link>
              . We use industry-standard security measures to protect credentials
              and sensitive information. OAuth tokens and other sensitive data
              are not exposed to your browser except as needed to operate the
              Service. We do not sell your personal data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              9. Service availability and third-party platforms
            </h2>
            <p>
              Social0 depends on third-party platforms and APIs (including Meta,
              Google/YouTube, X, TikTok, LinkedIn, and others). Features may
              change, become unavailable, or stop functioning due to actions
              taken by those platforms, including API changes, policy updates,
              account restrictions, or outages. We are not responsible for
              interruptions or failures caused by third-party services outside
              our reasonable control.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              10. Termination and data deletion
            </h2>
            <p>
              You may stop using the Service at any time. You may disconnect
              individual social accounts from your dashboard. You may delete
              your Social0 account in Settings, or request deletion as described
              on our{" "}
              <Link href="/data-deletion" className={linkClass}>
                Data Deletion
              </Link>{" "}
              page. We will process such requests in accordance with our Privacy
              Policy, except where we must retain data for legal, security, tax,
              or fraud-prevention reasons.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              11. Changes to the service and terms
            </h2>
            <p>
              We may change the Service or these Terms. When we update these
              Terms, we will post the revised Terms on this page, update the
              “Last updated” date and version, and{" "}
              <strong>
                notify you by email at the address associated with your account
              </strong>
              . Continued use of the Service after the effective date of the
              revised Terms constitutes acceptance, except where applicable law
              requires a different form of consent. If you do not agree to the
              revised Terms, you must stop using the Service and may cancel or
              delete your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              12. Disclaimers and limitation of liability
            </h2>
            <p>
              The Service is provided “as is.” We do not guarantee uninterrupted
              or error-free operation or compatibility with every platform at
              all times. To the maximum extent permitted by law, we are not
              liable for indirect, incidental, or consequential damages arising
              from your use of the Service, including losses related to
              third-party platform availability or changes. Nothing in these
              Terms excludes liability that cannot be excluded under applicable
              law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              13. Governing law and disputes
            </h2>
            <p>
              These Terms are governed by the laws of India, without regard to
              conflict-of-law principles, except where mandatory consumer
              protection laws in your country of residence require otherwise.
              Subject to those mandatory laws, courts in Bengaluru, Karnataka,
              India have exclusive jurisdiction over disputes arising from these
              Terms or the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              14. Contact
            </h2>
            <p className="mb-2">
              Questions about these Terms:
            </p>
            <ul className="list-none pl-0 space-y-1">
              <li>{LEGAL_ENTITY.operatorName}</li>
              <li>
                <a href={`mailto:${LEGAL_ENTITY.legalEmail}`} className={linkClass}>
                  {LEGAL_ENTITY.legalEmail}
                </a>
              </li>
              <li>
                <a href={`mailto:${LEGAL_ENTITY.supportEmail}`} className={linkClass}>
                  {LEGAL_ENTITY.supportEmail}
                </a>
              </li>
              <li>
                <a
                  href={LEGAL_ENTITY.twitterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  {LEGAL_ENTITY.twitterHandle}
                </a>
              </li>
            </ul>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
