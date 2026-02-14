"use client";

import { RevealSection } from "@/components/RevealSection";

const cards = [
  {
    title: "Encrypted at rest",
    description:
      "OAuth tokens stored with AES-256-GCM; we never see your passwords.",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
  },
  {
    title: "Minimal access",
    description:
      "Only the scopes needed to post and manage your content—nothing more.",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.906 5.236m-3.134 1.589a10.05 10.05 0 01-1.563 3.029M12 12l-3.59-3.59"
        />
      </svg>
    ),
  },
  {
    title: "Disconnect anytime",
    description:
      "Remove a platform or delete your account and we remove your data.",
    icon: (
      <svg
        className="w-7 h-7"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z"
        />
      </svg>
    ),
  },
];

export function SecuritySection() {
  return (
    <section className="py-16 sm:py-20 bg-emerald-800 relative overflow-hidden">
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_1px_1px,rgb(255,255,255)_1px,transparent_0)] bg-size-[24px_24px] pointer-events-none" />
      
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <RevealSection>
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-4">
              Your data, your control
            </h2>
            <p className="text-base text-gray-300 leading-relaxed font-medium">
              We take security seriously. Platform reviewers and users expect
              clarity—here&apos;s how we handle your data.
            </p>
          </div>
        </RevealSection>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {cards.map((card, i) => (
            <RevealSection
              key={card.title}
              delay={i < 3 ? (i as 0 | 1 | 2) : 0}
            >
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 text-center h-full hover:bg-white/10 transition-colors">
                <div className="w-14 h-14 rounded-xl bg-white/10 backdrop-blur-sm text-white flex items-center justify-center mx-auto mb-4 border border-white/20">
                  {card.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  {card.title}
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {card.description}
                </p>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}
