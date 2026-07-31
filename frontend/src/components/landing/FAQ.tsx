import { useEffect, useState } from "react";
import { faqsForMode } from "./landing-faqs";
import { useLandingMode } from "./landing-mode";

export function FAQ() {
  const { mode } = useLandingMode();
  const faqs = faqsForMode(mode);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    setOpenIndex(null);
  }, [mode]);

  return (
    <section id="faq" className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-14">
          <div className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            FAQ
          </div>
          <h2 className="max-w-md font-serif text-[clamp(28px,4vw,44px)] leading-tight tracking-tight text-foreground">
            Questions & answers.
          </h2>
        </div>

        <div className="divide-y divide-border rounded-2xl border border-border bg-background dark:bg-background/50">
          {faqs.map((faq, i) => (
            <div key={faq.question} className="px-6 py-5 md:px-8">
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex w-full items-start justify-between gap-4 text-left"
              >
                <span className="text-[15px] font-medium text-foreground">
                  {faq.question}
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-lg text-muted-foreground transition-transform duration-200 dark:bg-muted/60 ${openIndex === i ? "rotate-45" : ""}`}
                >
                  +
                </span>
              </button>
              {openIndex === i && (
                <p className="mt-4 pr-10 text-[14px] leading-relaxed text-muted-foreground">
                  {faq.answer}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
