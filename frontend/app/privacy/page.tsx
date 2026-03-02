import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "Privacy Policy | Social0",
  description: "Privacy policy for Social0.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: February 2026
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              1. Introduction
            </h2>
            <p>
              Social0 (“we,” “our,” or “us”) respects your privacy. This Privacy
              Policy explains what information we collect, how we use it, how we
              protect it, and your rights regarding your data when you use our
              social media management service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              2. Information we collect
            </h2>
            <p className="mb-3">
              We collect information you provide and information we obtain when
              you use the Service:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Account information:</strong> When you sign in (e.g.
                with Google), we receive and store the identifiers and profile
                data provided by that provider (such as name, email, profile
                picture) as needed to operate your account.
              </li>
              <li>
                <strong>Connected account (OAuth) data:</strong> When you
                connect a social platform (LinkedIn, Instagram, YouTube,
                Pinterest, TikTok, X, Threads, Bluesky), we receive access
                tokens and related data from that platform. We request only the
                minimum scopes necessary to publish and manage content on your
                behalf. We do not receive or store your passwords for these
                platforms.
              </li>
              <li>
                <strong>Content and usage:</strong> We store the content you
                create (posts, media references, scheduling data) and logs
                necessary to operate, secure, and improve the Service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              3. How we use your information
            </h2>
            <p>
              We use the information above to: provide the Service (e.g.
              publishing and scheduling posts); maintain and secure your
              account; store and refresh OAuth tokens so we can act on your
              behalf; improve the Service; and comply with law. We do not sell
              your personal information. We do not use your connected account
              data for advertising targeting or for purposes unrelated to
              providing the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              4. Data storage and security
            </h2>
            <p>
              OAuth tokens and other credentials are encrypted at rest using
              AES-256-GCM. We use per-account key derivation (HKDF) and do not
              expose tokens to your browser or to frontend code. Tokens are used
              only on the server to perform actions you request (e.g. posting to
              a platform). We follow industry practices to protect data in
              transit and at rest. If a platform supports PKCE or similar
              security measures, we use them where applicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              5. Cookies and similar technologies
            </h2>
            <p>
              We use cookies and similar technologies for authentication,
              session management, and security (e.g. HTTP-only cookies for
              session and CSRF protection). We do not use cookies for
              third-party advertising. You can control cookies through your
              browser settings, though disabling them may affect your ability to
              use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              6. Third-party services
            </h2>
            <p>
              We integrate with third-party authentication providers (e.g.
              Google) and with each social platform you connect. Those providers
              have their own privacy policies. When you connect a platform, we
              receive only the data that platform makes available via its API
              for the scopes you authorize. We use that data solely to provide
              the Service (e.g. posting, scheduling). We may use other
              third-party services (e.g. hosting, analytics) that process data
              on our behalf under contractual obligations consistent with this
              policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              7. Google user data
            </h2>
            <p className="mb-3">
              Social0&apos;s use of data received from Google APIs adheres to
              the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <p className="mb-3">
              When you connect your YouTube account, we request the following
              scopes:
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
              to any third parties. Google user data is used exclusively to
              provide the core scheduling and publishing features of Social0. It
              is never used for advertising, profiling, or any purpose unrelated
              to the Service. Data is stored encrypted and access is revoked
              upon disconnecting your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              8. Data retention and deletion
            </h2>
            <p>
              We retain your data for as long as your account is active and as
              needed to provide the Service and comply with legal obligations.
              When you disconnect a social account, we stop using its tokens and
              remove or anonymize associated data in line with our retention
              practices. When you request account deletion, we will delete or
              anonymize your personal data and connected-account data within a
              reasonable period, except where we must retain data for legal,
              security, or legitimate operational reasons. You may contact us to
              request deletion or a copy of your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              9. Your rights
            </h2>
            <p>
              Depending on your location, you may have the right to access,
              correct, delete, or port your personal data, or to object to or
              restrict certain processing. You can disconnect social accounts
              and request account deletion from the Service or by contacting us.
              We will respond to valid requests in accordance with applicable
              law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              10. Updates to this policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will post
              the updated policy on this page and update the “Last updated”
              date. For material changes we may provide additional notice (e.g.
              email or in-app). Continued use of the Service after the update
              constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              11. Contact
            </h2>
            <p>
              For privacy-related questions or to exercise your rights, please
              contact us at{" "}
              <a
                href="mailto:privacy@social0.app"
                className="text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                privacy@social0.app
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
