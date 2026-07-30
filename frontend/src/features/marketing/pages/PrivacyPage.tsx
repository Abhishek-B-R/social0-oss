import type { PageMetadata } from "@/lib/seo";
import Link from "@/components/AppLink";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { DOCS_PRIVACY_URL } from "@/lib/docs-url";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

export const metadata: PageMetadata = {
  title: "Privacy Policy | Social0 - Social Media Scheduling Tool",
  description:
    "Read the Social0 privacy policy. Learn how we collect, use, and protect your data when you use our social media scheduling platform.",
  alternates: { canonical: "https://social0.app/privacy" },
};

const linkClass =
  "text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400 dark:hover:text-emerald-300";

export default function PrivacyPage() {
  return (
    <div className="landing landing-page min-h-screen flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <a
          href={DOCS_PRIVACY_URL}
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
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[22px] text-foreground landing mb-8">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: July 2026 · Version 2.0
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              1. Introduction
            </h2>
            <p>
              Social0 (“we,” “our,” or “us”) respects your privacy. This Privacy
              Policy explains what information we collect, how we use it, how we
              protect it, who processes it on our behalf, and your rights when
              you use our social media management service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              2. Information we collect
            </h2>
            <p className="mb-3">
              We collect information you provide and information we obtain when
              you use the Service:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Account information:</strong> name, email address,
                profile picture (when provided by you or your sign-in provider),
                and authentication identifiers.
              </li>
              <li>
                <strong>Connected account (OAuth) data:</strong> when you
                connect a social platform (LinkedIn, Instagram, YouTube,
                Pinterest, TikTok, X, Threads, Bluesky, Facebook, etc.), we
                receive access tokens and related profile/channel identifiers
                from that platform. We request only the minimum scopes necessary
                to publish and manage content on your behalf. We do not receive
                or store your passwords for these platforms.
              </li>
              <li>
                <strong>Content and usage:</strong> posts, drafts, media you
                upload, scheduling data, connection metadata, and logs needed to
                operate, secure, and improve the Service.
              </li>
              <li>
                <strong>Payment and billing information:</strong> when you
                subscribe, payment is processed by{" "}
                {LEGAL_ENTITY.paymentProcessor.name}. Social0 may store billing
                metadata needed to run your subscription (for example,
                customer/subscription IDs, plan tier, billing interval, renewal
                or cancellation status, and invoice references).{" "}
                <strong>
                  We do not store your full payment card number, CVV, or bank
                  account credentials
                </strong>
                — those are collected and stored by{" "}
                {LEGAL_ENTITY.paymentProcessor.name} under its own terms and
                privacy policy. Tax amounts (including GST where applicable) are
                calculated and shown at checkout / on processor invoices.
              </li>
              <li>
                <strong>Technical data:</strong> IP address, browser/device
                information, and security-related events (for fraud prevention
                and abuse detection).
              </li>
              <li>
                <strong>Analytics data:</strong> product-usage events (for
                example page views and feature usage) via our analytics
                provider. Session recording is disabled. See Section 6.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              3. How we use your information
            </h2>
            <p>
              We use the information above to: provide the Service (including
              publishing and scheduling); maintain and secure your account;
              store and refresh OAuth tokens so we can act on your behalf;
              process subscriptions and taxes via our payment processor; send
              transactional emails (security, billing, legal notices); improve
              the Service (including product analytics); and
              comply with law. We do not sell your personal information. We do
              not use your connected account data for advertising targeting or
              for purposes unrelated to providing the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              4. Data storage and security
            </h2>
            <p>
              We use industry-standard security measures to protect credentials
              and sensitive information. OAuth tokens are encrypted at rest and
              are not exposed to frontend code. Tokens are used only on the
              server to perform actions you request. We follow industry practices
              to protect data in transit and at rest.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              5. Children’s privacy
            </h2>
            <p>
              The Service is not directed to children under 13. We do not
              knowingly collect personal information from children under 13. If
              you believe a child has provided us personal information, contact{" "}
              <a
                href={`mailto:${LEGAL_ENTITY.privacyEmail}`}
                className={linkClass}
              >
                {LEGAL_ENTITY.privacyEmail}
              </a>
              ; we will take reasonable steps to delete such information
              promptly.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              6. Cookies and similar technologies
            </h2>
            <p>
              We use cookies and similar technologies for authentication,
              session management, security, and product analytics (to understand
              how the Service is used). We do not use cookies for third-party
              advertising. You can control cookies through your browser
              settings, though disabling them may affect sign-in or use of the
              Service. Session recording is disabled.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              7. Processors and third-party services
            </h2>
            <p className="mb-3">
              We use service providers (“processors”) that process personal data
              on our behalf to operate the Service. Key categories include:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-3">
              <li>
                <strong>Payments:</strong> {LEGAL_ENTITY.paymentProcessor.name}{" "}
                — payment processing, subscriptions, and tax/invoice handling.
              </li>
              <li>
                <strong>Hosting / infrastructure:</strong> cloud hosting and
                related infrastructure providers that store application data and
                media.
              </li>
              <li>
                <strong>Email:</strong> transactional email delivery (e.g.
                Resend) for verification, billing, and legal notices.
              </li>
              <li>
                <strong>Analytics:</strong> product analytics (e.g. PostHog) to
                understand usage. Session recording is disabled.
              </li>
              <li>
                <strong>Identity / social platforms:</strong> Google and each
                social network you connect (they process data under their own
                policies when you authorize access).
              </li>
            </ul>
            <p>
              Those providers process data under contractual or equivalent
              obligations consistent with this policy, except where they act as
              independent controllers (for example, Google when you use Google
              sign-in or YouTube, or {LEGAL_ENTITY.paymentProcessor.name} for
              card data).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              8. Google and YouTube user data
            </h2>
            <p className="mb-3">
              Social0&apos;s use of data received from Google APIs adheres to
              the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className={linkClass}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <p className="mb-3">
              Google’s own collection and use of your information is described
              in the{" "}
              <a
                href="https://policies.google.com/privacy"
                className={linkClass}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Privacy Policy
              </a>
              . YouTube’s terms are at{" "}
              <a
                href="https://www.youtube.com/t/terms"
                className={linkClass}
                target="_blank"
                rel="noopener noreferrer"
              >
                youtube.com/t/terms
              </a>
              .
            </p>
            <p className="mb-3">
              When you connect your YouTube account, we typically request:
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>
                <strong>youtube.upload</strong> — to upload and publish videos
                to your YouTube channel on your behalf.
              </li>
              <li>
                <strong>youtube.readonly</strong> — to verify your channel
                details and check upload status.
              </li>
            </ul>
            <p>
              We do not sell, share, transfer, or disclose your Google user data
              to third parties for advertising or unrelated purposes. Google
              user data is used exclusively to provide Social0’s scheduling and
              publishing features. Access is revoked when you disconnect YouTube
              in Connections or delete your Social0 account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              9. Data retention and deletion
            </h2>
            <p className="mb-3">
              We retain your data for as long as your account is active and as
              needed to provide the Service and comply with legal obligations
              (including tax and dispute records). When you disconnect a social
              account, we stop using its tokens and remove or anonymize
              associated connection data in line with our retention practices.
            </p>
            <p>
              You may delete your account in{" "}
              <Link href="/dashboard/settings" className={linkClass}>
                Settings
              </Link>
              , or request deletion via our{" "}
              <Link href="/data-deletion" className={linkClass}>
                Data Deletion
              </Link>{" "}
              page. We aim to complete verified deletion requests within 30
              days, except where limited retention is required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              10. Your rights (including DPDP-style rights)
            </h2>
            <p className="mb-3">
              Depending on applicable law (including India’s Digital Personal
              Data Protection Act, 2023, where it applies), you may have rights
              to:
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>
                <strong>Access</strong> — obtain confirmation of processing and
                a copy of personal data we hold about you.
              </li>
              <li>
                <strong>Correction</strong> — request correction of inaccurate
                or incomplete personal data.
              </li>
              <li>
                <strong>Erasure</strong> — request deletion of personal data,
                subject to legal retention exceptions.
              </li>
              <li>
                <strong>Withdraw consent</strong> — where processing is based on
                consent.
              </li>
              <li>
                <strong>Nomination</strong> — nominate another individual to
                exercise rights on your behalf in the event of death or
                incapacity, where such nomination is recognized under applicable
                law; contact us to record a nomination.
              </li>
            </ul>
            <p>
              To exercise these rights, email{" "}
              <a
                href={`mailto:${LEGAL_ENTITY.privacyEmail}`}
                className={linkClass}
              >
                {LEGAL_ENTITY.privacyEmail}
              </a>{" "}
              or use in-app account deletion. We aim to respond within{" "}
              <strong>30 days</strong> of a complete, verifiable request (or
              sooner where law requires). We may ask for information reasonably
              needed to verify your identity.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              11. Updates to this policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. When we do,
              we will post the updated policy on this page, update the “Last
              updated” date and version, and{" "}
              <strong>
                notify you by email at the address associated with your account
              </strong>
              . Continued use of the Service after the effective date of the
              revised policy constitutes acceptance, except where applicable law
              requires a different form of consent.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-foreground mb-2">
              12. Contact
            </h2>
            <p className="mb-2">
              Privacy questions or data requests:
            </p>
            <ul className="list-none pl-0 space-y-1">
              <li>{LEGAL_ENTITY.operatorName}</li>
              <li>
                <a
                  href={`mailto:${LEGAL_ENTITY.privacyEmail}`}
                  className={linkClass}
                >
                  {LEGAL_ENTITY.privacyEmail}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${LEGAL_ENTITY.supportEmail}`}
                  className={linkClass}
                >
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
