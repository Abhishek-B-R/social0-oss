import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { MdQuestionMark } from "react-icons/md";
import { DOCS_TERMS_URL } from "@/lib/docs-url";

export const metadata: Metadata = {
  title: "Terms of Service | Social0 — Social Media Scheduling Tool",
  description:
    "Read the Social0 terms of service. Understand your rights and responsibilities when using our social media scheduling and publishing platform.",
  alternates: { canonical: "https://social0.app/terms" },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground landing">
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
          Terms and Conditions
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: February 2026
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              1. Acceptance of terms
            </h2>
            <p>
              By accessing or using Social0 (“Service”), you agree to be bound
              by these Terms and Conditions. If you do not agree, do not use the
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              2. Description of service
            </h2>
            <p>
              Social0 is a social media management platform that allows you to
              connect your social media accounts, create content, and schedule
              or publish posts across multiple platforms (e.g. LinkedIn,
              Instagram, YouTube, Pinterest, TikTok, X, Threads, Bluesky) from
              one dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              3. Account and third-party connections
            </h2>
            <p>
              You may sign in with a third-party provider (e.g. Google). When
              you connect a social platform to Social0, we use that platform’s
              official OAuth (or equivalent) flow. You authorize us to access
              only the permissions (scopes) necessary to publish and manage
              content on your behalf. We do not store your social network
              passwords. Access tokens we receive are encrypted and stored
              securely; we request only the minimum scopes required for posting
              and related functionality. You may disconnect any connected
              account at any time from your dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              4. Your content and conduct
            </h2>
            <p>
              You are responsible for the content you create and publish through
              the Service. You must comply with each platform’s terms and
              policies and with applicable law. You may not use the Service for
              spam, impersonation, or illegal activity. We may suspend or
              terminate access if we reasonably believe you have violated these
              terms or any platform policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              5. Data handling and security
            </h2>
            <p>
              We process and store data as described in our Privacy Policy.
              OAuth tokens and other sensitive credentials are encrypted
              (AES-256-GCM) and are not exposed to your browser or to third
              parties except as needed to perform the Service (e.g. sending
              posts to the respective platforms). We do not sell your personal
              data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              6. Termination and data deletion
            </h2>
            <p>
              You may stop using the Service at any time. You may disconnect
              individual social accounts from your dashboard. You may request
              deletion of your Social0 account and associated data; we will
              process such requests in accordance with our Privacy Policy and
              delete or anonymize your data within a reasonable period, except
              where we must retain it for legal or operational reasons.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              7. Changes to the service and terms
            </h2>
            <p>
              We may change the Service or these terms. We will post updated
              terms on this page and update the “Last updated” date. Continued
              use of the Service after changes constitutes acceptance of the
              revised terms. For material changes we may provide additional
              notice (e.g. email or in-app).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              8. Disclaimers and limitation of liability
            </h2>
            <p>
              The Service is provided “as is.” We do not guarantee uninterrupted
              or error-free operation or compatibility with every platform at
              all times. To the maximum extent permitted by law, we are not
              liable for indirect, incidental, or consequential damages arising
              from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold font-serif text-[22px]  text-foreground mb-2">
              9. Contact
            </h2>
            <p>
              For questions about these Terms and Conditions, please contact us
              at{" "}
              <a
                href="mailto:legal@social0.app"
                className="text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                legal@social0.app
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
