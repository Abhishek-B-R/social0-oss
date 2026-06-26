import type { Metadata } from "next";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "Data Deletion Request | Social0 - Social Media Scheduling Tool",
  description:
    "Disconnect accounts in Connections, or email to request deletion of post content and personal data from Social0.",
  alternates: { canonical: "https://social0.app/data-deletion" },
};

const REQUEST_EMAIL = "abhishek@social0.app";
const REQUEST_SUBJECT = "Data Deletion Request";

export default function DataDeletionPage() {
  const mailtoHref = `mailto:${REQUEST_EMAIL}?subject=${encodeURIComponent(REQUEST_SUBJECT)}`;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground landing">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[22px] text-foreground landing mb-6">
          Data Deletion Request
        </h1>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-10 text-base leading-relaxed text-foreground">
          <p className="text-muted-foreground text-lg leading-relaxed">
            You can manage connected platforms yourself, or ask us to delete
            your post content and other data held in Social0. This page explains
            what we hold, the difference between disconnecting and a full
            deletion request, and what happens when we process an email request.
          </p>

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
              and click the remove (×) icon next to the platform. That revokes
              the connection and removes it from Social0-it does{" "}
              <span className="text-foreground font-medium">not</span> delete
              your drafts, scheduled posts, published post records, or uploaded
              media already stored in Social0.
            </p>
            <p className="text-muted-foreground">
              If you want that post content and media removed from our systems
              as well, use the email request below.
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
            </ul>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              How to request post content and account data deletion
            </h2>
            <p className="text-muted-foreground mb-3">
              To have your posts, drafts, media, and other personal data removed
              from Social0 (beyond disconnecting platforms in Connections), send
              an email to{" "}
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
              We may follow up from the same address if we need to confirm your
              identity before completing the request.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Timeline
            </h2>
            <p className="text-muted-foreground">
              We aim to process data deletion requests within{" "}
              <strong className="text-foreground font-semibold">30 days</strong>{" "}
              of receiving a complete, verifiable request.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              What gets deleted
            </h2>
            <p className="text-muted-foreground">
              When your request is approved and processed, we permanently remove
              your connected accounts, posts, media uploads, and other personal
              information tied to your Social0 account, subject to any limited
              retention required by law (for example, minimal billing or fraud
              records where applicable).
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
