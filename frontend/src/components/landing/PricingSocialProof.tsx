/**
 * Compact proof strip for /pricing — PLACEHOLDER metrics, replace before shipping.
 */
const metrics = [
  { value: "2,400+", label: "creators posting" },
  { value: "9", label: "platforms included" },
  { value: "API · MCP · CLI", label: "on every plan" },
  { value: "Cancel anytime", label: "no lock-in" },
] as const;

export function PricingSocialProof() {
  return (
    <section
      className="px-4 py-12 sm:px-6 lg:px-8"
      aria-label="Social proof"
    >
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-6 text-center">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Why creators upgrade
          </p>
          <h2 className="mt-2 font-serif text-[clamp(22px,3vw,32px)] italic leading-tight text-muted-foreground">
            Less guesswork. More shipping.
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4 dark:border-white/10">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="bg-background px-4 py-6 text-center dark:bg-[#111111] sm:px-6 sm:py-8"
            >
              <div className="font-serif text-[clamp(20px,2.5vw,28px)] tracking-tight text-foreground">
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
