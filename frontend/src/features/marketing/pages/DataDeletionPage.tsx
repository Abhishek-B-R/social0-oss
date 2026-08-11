import type { PageMetadata } from "@/lib/seo";
import Link from "@/components/AppLink";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

export const metadata: PageMetadata = {
  title: "Data Deletion Request | Social0 - Social Media Scheduling Tool",
  description:
    "Delete your Social0 account in Settings, disconnect platforms in Connections, or email privacy@social0.app to request data deletion.",
  alternates: { canonical: "https://social0.app/data-deletion" },
};

const REQUEST_EMAIL = LEGAL_ENTITY.privacyEmail;
const REQUEST_SUBJECT = "Data Deletion Request";

export default function DataDeletionPage() {
  const mailtoHref = `mailto:${REQUEST_EMAIL}?subject=${encodeURIComponent(REQUEST_SUBJECT)}`;

  return (
    <div className="landing landing-page min-h-screen flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[22px] text-foreground landing mb-6">
          Data Deletion Request
        </h1>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-10 text-base leading-relaxed text-foreground">
          <p className="text-muted-foreground text-lg leading-relaxed">
            You can delete your Social0 account in the app, disconnect platforms
            yourself, or email us to request deletion. This page explains what
            we hold and what happens when deletion is processed.
          </p>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Fastest option: delete your account in Settings
            </h2>
            <p className="text-muted-foreground mb-3">
              Signed-in users can close their Social0 account from{" "}
              <Link
                href="/dashboard/settings"
                className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
              >
                Dashboard → Settings → Security
              </Link>
              . That removes login access, connected platforms, teams, API keys,
              and related account settings. Post history may be retained in our
              systems; content already published on third-party platforms is not
              removed by Social0.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Removing connected accounts yourself
            </h2>
            <p className="text-muted-foreground mb-3">
              You can disconnect a social account at any time: open{" "}
              <Link
                href="/dashboard/connections"
                className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
              >
                Connections
              </Link>{" "}
              and remove the platform. That revokes the connection in Social0 —
              it does{" "}
              <span className="text-foreground font-medium">not</span> by itself
              delete your drafts, scheduled posts, published post records, or
              uploaded media already stored in Social0.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              What we store
            </h2>
            <p className="text-muted-foreground mb-3">
              Depending on how you use the service, we may hold:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
              <li>
                Connected social accounts (OAuth tokens and related identifiers)
              </li>
              <li>Scheduled, draft, and published posts and their metadata</li>
              <li>
                Uploaded media (e.g. images and videos you attach to posts)
              </li>
              <li>Account settings and preferences tied to your profile</li>
              <li>
                Billing metadata (subscription/customer IDs) — card details are
                held by {LEGAL_ENTITY.paymentProcessor.name}, not Social0
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Email request (if you cannot use in-app deletion)
            </h2>
            <p className="text-muted-foreground mb-3">
              Send an email to{" "}
              <a
                href={mailtoHref}
                className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
              >
                {REQUEST_EMAIL}
              </a>{" "}
              with the subject line{" "}
              <span className="text-foreground font-medium">
                &ldquo;{REQUEST_SUBJECT}&rdquo;
              </span>
              . Include the email address of the Social0 account you want
              covered so we can verify ownership.
            </p>
            <p className="text-sm text-muted-foreground">
              We may follow up if we need to confirm your identity before
              completing the request.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Timeline
            </h2>
            <p className="text-muted-foreground">
              We aim to process data deletion requests within{" "}
              <strong className="text-foreground font-semibold">30 days</strong>{" "}
              of receiving a complete, verifiable request (in-app deletion is
              typically immediate for app data, with processor-side billing
              records retained as required).
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              What gets deleted
            </h2>
            <p className="text-muted-foreground">
              When account closure is processed, we remove login credentials,
              connected accounts, teams/workspaces you own, API keys, webhooks,
              queues, and settings. Post and media records may be retained.
              Content already published to third-party platforms is not deleted
              from those platforms by Social0 — manage that content on each
              platform. Limited billing or fraud records may also be retained
              where required.
            </p>
          </section>

          <p className="text-sm text-muted-foreground pt-4 border-t border-border">
            For general privacy practices, see our{" "}
            <Link
              href="/privacy"
              className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
