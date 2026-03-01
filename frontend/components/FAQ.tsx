"use client";

import { useState } from "react";
import { RevealSection } from "@/components/RevealSection";

const faqs = [
  {
    question: "What platforms do you support?",
    answer:
      "Social0 supports LinkedIn, Instagram, Facebook, YouTube, Pinterest, TikTok, X (Twitter), Threads, and Bluesky. Connect any combination of these and publish to all of them from one place.",
  },
  {
    question: "What content types can I post?",
    answer:
      "You can create text posts, image posts, video posts, threaded posts, and collection posts. We format your content appropriately for each platform so it looks right everywhere.",
  },
  {
    question: "How does scheduling work?",
    answer:
      "When you create a post, you can either publish it immediately or choose a date and time. We'll publish it for you at that time across all connected platforms. You don't need to be online when it goes out.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes. We use OAuth to connect your accounts. Your access tokens are encrypted with AES-256-GCM and stored securely. We only request the minimum permissions needed to publish on your behalf. You can disconnect any platform or delete your account and data at any time.",
  },
  {
    question: "Do I need a business account on each platform?",
    answer:
      "It depends on the platform. Instagram requires an Instagram Business or Creator account. LinkedIn, X, TikTok, Threads, YouTube, Pinterest, and Bluesky work with standard personal or creator accounts where posting is allowed. We'll guide you during connection if a specific account type is required.",
  },
  {
    question: "Can I try it for free?",
    answer:
      "Yes. Sign in and you’ll get a 7-day free trial so you can try everything with no commitment. After the trial, we’ll charge only if you choose to stay. If it’s not for you, you can disconnect your accounts anytime, no hard feelings.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-16 sm:py-20 bg-background">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <RevealSection>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-10">
            Frequently asked questions
          </h2>
        </RevealSection>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <RevealSection key={i} delay={i < 4 ? (i as 0 | 1 | 2 | 3) : 0}>
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 py-5 px-6 text-left hover:bg-muted/60 transition-colors duration-200"
                >
                  <span className="text-lg font-semibold text-foreground">
                    {faq.question}
                  </span>
                  <span
                    className={`shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xl leading-none transition-transform duration-300 ease-out ${
                      openIndex === i ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{
                    gridTemplateRows: openIndex === i ? "1fr" : "0fr",
                  }}
                >
                  <div className="overflow-hidden">
                    <div className="px-6 pb-5 pt-0">
                      <p className="text-muted-foreground text-base leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}
