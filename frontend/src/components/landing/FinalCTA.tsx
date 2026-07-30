import Link from "@/components/AppLink";
import { HeroTopIllustration } from "./hero-illustrations/HeroIsoTop";

export function FinalCTA({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="relative overflow-hidden px-6 py-20 lg:px-8 lg:py-28">
      <div className="relative mx-auto max-w-[1180px] overflow-hidden rounded-[28px] border border-emerald-500/20 bg-gradient-to-br from-emerald-600 via-emerald-500 to-[#059669]">
        {/* Stripe overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(0,0,0,0.12) 12px, rgba(0,0,0,0.12) 24px)",
          }}
          aria-hidden
        />
        {/* Isometric ghost */}
        <div
          className="pointer-events-none absolute -right-16 -top-10 hidden opacity-30 md:block lg:opacity-40"
          aria-hidden
        >
          <div className="origin-top-right scale-[0.55] lg:scale-[0.7]">
            <HeroTopIllustration />
          </div>
        </div>

        <div className="relative z-10 px-8 py-16 text-center sm:px-12 sm:py-20">
          <h2 className="mb-4 font-serif text-[clamp(32px,5vw,52px)] leading-tight tracking-tight text-white">
            Ready to grow with Social0?
          </h2>
          <p className="mx-auto mb-10 max-w-md text-[16px] leading-relaxed text-white/75">
            Join early. Lock in launch pricing before it increases.
          </p>
          <Link
            href={signedIn ? "/dashboard" : "/auth"}
            className="inline-flex items-center gap-2 rounded-[11px] bg-white px-8 py-3.5 text-[15px] font-semibold text-emerald-700 transition-all hover:-translate-y-px hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)]"
          >
            {signedIn ? "Go to dashboard" : "Get started free"}
            <span aria-hidden="true">→</span>
          </Link>
          <p className="mt-4 text-[12px] text-white/60">
            Start free · No credit card required
          </p>
        </div>
      </div>
    </section>
  );
}
