import Link from "next/link";

export function FinalCTA({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="bg-foreground py-24 pb-32 text-center dark:bg-[#0A0A0A]">
      <div className="mx-auto max-w-[1100px] px-6 lg:px-8">
        <h2 className="mb-5 font-serif text-[clamp(36px,5vw,56px)] leading-tight tracking-tight text-background dark:text-white">
          Stop copy-pasting.
          <br />
          Start <em className="italic text-emerald-400">posting</em>.
        </h2>
        <p className="mx-auto mb-10 max-w-md text-[16px] leading-relaxed text-background/50 dark:text-white/50">
          Join early. Lock in launch pricing before it increases.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-[10px] bg-background px-8 py-3.5 text-[15px] font-medium text-foreground transition-all hover:-translate-y-px hover:text-foreground hover:shadow-[0_8px_32px_rgba(74,222,128,0.25)] dark:bg-white dark:text-black"
        >
          {signedIn ? "Go to dashboard" : "Get started free"}
          <span aria-hidden="true">→</span>
        </Link>
        <p className="mt-4 text-[12px] text-white/50">
          7-day free trial · Cancel anytime
        </p>
      </div>
    </section>
  );
}
