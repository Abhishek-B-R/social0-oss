import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

const linkClass =
  "text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400 dark:hover:text-emerald-300";

export default function ContactPage() {
  return (
    <div className="landing landing-page min-h-screen flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 w-full">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[22px] text-foreground landing mb-6">
          Contact Social0
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          How to reach support, legal, and privacy
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Product support
            </h2>
            <p>
              Email{" "}
              <a href={`mailto:${LEGAL_ENTITY.supportEmail}`} className={linkClass}>
                {LEGAL_ENTITY.supportEmail}
              </a>{" "}
              for dashboard, publishing, billing, API, MCP, or CLI help. Include
              the account email, the platforms involved, and any{" "}
              <code>tracking_id</code> from a publish job so we can trace the
              pipeline. We do not offer phone support. Typical replies are by
              email during the operator&apos;s working hours.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              Legal and privacy
            </h2>
            <p>
              Legal:{" "}
              <a href={`mailto:${LEGAL_ENTITY.legalEmail}`} className={linkClass}>
                {LEGAL_ENTITY.legalEmail}
              </a>
              . Privacy and data requests:{" "}
              <a href={`mailto:${LEGAL_ENTITY.privacyEmail}`} className={linkClass}>
                {LEGAL_ENTITY.privacyEmail}
              </a>
              . Social0 is remote-first and does not publish a walk-in street
              address. Country of operation: India. Public social profiles are
              linked from the site footer.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold font-serif text-foreground mb-3">
              What to send
            </h2>
            <p>
              For failed publishes, send the post id, platforms, and the error
              text shown in the dashboard or job payload. For API key issues,
              say whether you are using the REST API, MCP OAuth, or the CLI.
              Do not paste live API keys in email.
            </p>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
