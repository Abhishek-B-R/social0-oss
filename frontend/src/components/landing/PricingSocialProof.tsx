/**
 * Compact proof strip for /pricing — honest claims only (no inflated creator counts).
 */
import { getPlanLimits } from "@/lib/plans";

const freePosts = getPlanLimits("free").maxFreePosts;

const metrics = [
  { value: `${freePosts}`, label: "free posts to try" },
  { value: "9", label: "platforms included" },
  { value: "API · MCP · CLI", label: "on every plan" },
] as const;

export function PricingSocialProof() {
  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-label="Social proof">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-8 text-center">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Why creators upgrade
          </p>
          <h2 className="mt-2 font-sans text-[clamp(28px,4vw,40px)] font-bold leading-tight tracking-tight text-foreground dark:text-white">
            Less guesswork. More shipping.
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border dark:border-white/10">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="bg-background px-4 py-6 text-center dark:bg-[#111111] sm:px-6 sm:py-8"
            >
              <div className="font-serif text-[clamp(22px,3vw,32px)] tracking-tight text-foreground">
                {m.value}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground sm:text-[13px]">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
