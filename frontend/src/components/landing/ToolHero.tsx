import type { ReactNode } from "react";
import { firstSentence } from "@/lib/first-sentence";

/** Shared hero for every free tool: headline, one-line promise (full intro stays in the bot HTML), trust row. */
export function ToolHero({ title, intro, local = false }: { title: ReactNode; intro: string; local?: boolean }) {
  const trust = ["Free, no account", local ? "Runs in your browser, nothing uploaded" : "Works on any device", "Schedule to 9 networks"];
  return (
    <header className="flex flex-col items-center gap-4 text-center">
      <span className="rounded-full border border-emerald-600/30 bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
        Free tool
      </span>
      <h1 className="max-w-[20ch] font-serif text-[clamp(34px,5.5vw,56px)] text-balance text-[#333C4D] dark:text-white">{title}</h1>
      <p className="max-w-[56ch] text-[17px] leading-relaxed text-muted-foreground">{firstSentence(intro)}</p>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
        {trust.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>✓</span>
            {t}
          </li>
        ))}
      </ul>
    </header>
  );
}
