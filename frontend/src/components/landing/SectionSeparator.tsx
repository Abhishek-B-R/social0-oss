/** Orange/emerald node separators between major landing sections (Fynt-style). */
export function SectionSeparator({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative mx-auto flex w-[90%] max-w-[1400px] items-center py-2 ${className}`}
      aria-hidden
    >
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-foreground/15 to-transparent" />
      <div className="relative mx-3 flex items-center gap-2">
        <span className="h-2 w-2 rotate-45 rounded-[2px] border border-emerald-500/60 bg-emerald-500/20 dark:border-emerald-400/80 dark:bg-emerald-500/30" />
        <span className="font-serif text-[11px] tracking-[0.2em] text-muted-foreground/50">
          SOCIAL0
        </span>
        <span className="h-2 w-2 rotate-45 rounded-[2px] border border-emerald-500/60 bg-emerald-500/20 dark:border-emerald-400/80 dark:bg-emerald-500/30" />
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-foreground/15 to-transparent" />
    </div>
  );
}
