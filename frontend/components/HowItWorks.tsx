"use client";

import { RevealSection } from "@/components/RevealSection";

const steps = [
  {
    number: "1",
    title: "Connect your accounts",
    description:
      "Sign in with Google, then connect the social platforms you use. We use secure OAuth—you stay in control and can disconnect anytime.",
  },
  {
    number: "2",
    title: "Create your content",
    description:
      "Write your post once. Add images or video if you like. We support text, images, video, threads, and more.",
  },
  {
    number: "3",
    title: "Publish or schedule",
    description:
      "Send now or pick a time. One click publishes to all connected platforms, or schedule for later.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <RevealSection>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 text-center mb-4">
            How it works
          </h2>
          <p className="text-base text-gray-500 text-center max-w-xl mx-auto mb-12 font-medium">
            Three simple steps to get your content everywhere.
          </p>
        </RevealSection>
        <div className="grid md:grid-cols-3 gap-8 md:gap-6 relative">
          {/* Connecting line on desktop */}
          <div className="hidden md:block absolute top-7 left-[calc(16.666%+1.5rem)] right-[calc(16.666%+1.5rem)] h-0.5 bg-gray-200">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-300 border-2 border-white shadow-sm" />
          </div>
          
          {steps.map((step, i) => (
            <RevealSection key={step.number} delay={i as 0 | 1 | 2}>
              <div className="relative text-center md:text-left">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white font-bold text-xl mb-5 shadow-lg relative z-10">
                  {step.number}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {step.title}
                </h3>
                <p className="text-base text-gray-500 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}
