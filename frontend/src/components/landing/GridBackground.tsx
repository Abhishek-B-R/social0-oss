/** Subtle editorial grid behind the hero isometric stack. */
export function GridBackground({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-[0.05] dark:opacity-[0.07]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #10b981 1px, transparent 1px),
            linear-gradient(to bottom, #10b981 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 70% 45%, black 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 70% 45%, black 20%, transparent 75%)",
        }}
      />
      <div
        className="absolute -right-20 top-1/4 h-[420px] w-[420px] rounded-full opacity-20 blur-[100px] dark:opacity-30"
        style={{
          background:
            "radial-gradient(circle, rgba(16,185,129,0.45) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute left-1/4 top-1/2 h-[280px] w-[280px] -translate-y-1/2 rounded-full opacity-15 blur-[80px] dark:opacity-20"
        style={{
          background:
            "radial-gradient(circle, rgba(52,211,153,0.35) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
