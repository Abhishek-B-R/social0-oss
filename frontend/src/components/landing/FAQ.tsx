import { useState } from "react";
import { faqsForMode, type LandingFaq } from "./landing-faqs";
import { useLandingMode } from "./landing-mode";

export function FAQ() {
  const { mode } = useLandingMode();
  // Remount on mode change so open accordion resets without an effect
  return <FAQList key={mode} faqs={faqsForMode(mode)} />;
}

function FAQList({ faqs }: { faqs: LandingFaq[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-14">
          <div className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            FAQ
          </div>
          <h2 className="max-w-md font-serif text-[clamp(28px,4vw,44px)] leading-tight tracking-tight text-[#333C4D] dark:text-white">
            Questions & answers.
          </h2>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
          <div className="divide-y divide-border overflow-hidden rounded-[22px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111]">
            {faqs.map((faq, i) => {
              const open = openIndex === i;
              return (
                <div key={faq.question}>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : i)}
                    aria-expanded={open}
                    className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left md:px-8"
                  >
                    <span className="text-[15px] font-medium text-foreground">
                      {faq.question}
                    </span>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-lg text-muted-foreground transition-transform duration-200 dark:bg-muted/60 ${open ? "rotate-45" : ""}`}
                    >
                      +
                    </span>
                  </button>
                  {open ? (
                    <p className="px-6 pb-5 pr-10 text-[14px] leading-relaxed text-muted-foreground md:px-8 md:pr-14">
                      {faq.answer}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
