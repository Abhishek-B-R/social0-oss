type FaqItem = { question: string; answer: string };

export function PseoFaq({
  title = "Frequently asked questions",
  faqs,
}: {
  title?: string;
  faqs: readonly FaqItem[];
}) {
  return (
    <section className="px-6 py-16 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <h2 className="mb-8 font-serif text-[clamp(24px,3vw,36px)] tracking-tight text-[#333C4D] dark:text-white">
          {title}
        </h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-background dark:bg-background/50">
          {faqs.map((faq) => (
            <details key={faq.question} className="group px-6 py-5 md:px-8">
              <summary className="cursor-pointer list-none text-[15px] font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-start justify-between gap-4">
                  {faq.question}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
