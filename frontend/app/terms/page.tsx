import type { Metadata } from "next";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingFooter } from "@/components/LandingFooter";

export const metadata: Metadata = {
  title: "Terms and Conditions | Social0",
  description: "Terms and conditions for using Social0.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">
          Terms and Conditions
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: February 2026
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              1. Acceptance of terms
            </h2>
            <p>
              By accessing or using Social0 (“Service”), you agree to be bound
              by these Terms and Conditions. If you do not agree, do not use the
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
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
            <h2 className="text-lg font-semibold text-foreground mb-2">
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
            <h2 className="text-lg font-semibold text-foreground mb-2">
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
            <h2 className="text-lg font-semibold text-foreground mb-2">
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
            <h2 className="text-lg font-semibold text-foreground mb-2">
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
            <h2 className="text-lg font-semibold text-foreground mb-2">
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
            <h2 className="text-lg font-semibold text-foreground mb-2">
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
            <h2 className="text-lg font-semibold text-foreground mb-2">
              9. Contact
            </h2>
            <p>
              For questions about these Terms and Conditions, please contact us
              at{" "}
              <a
                href="mailto:support@social0.app"
                className="text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                support@social0.app
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
