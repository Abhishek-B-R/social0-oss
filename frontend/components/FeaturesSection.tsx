"use client";

import { RevealSection } from "@/components/RevealSection";
import { PostComposerMockup } from "@/components/feature-mockups/PostComposerMockup";
import { CalendarMockup } from "@/components/feature-mockups/CalendarMockup";
import { PlatformToggleMockup } from "@/components/feature-mockups/PlatformToggleMockup";
import { SecurityChecklistMockup } from "@/components/feature-mockups/SecurityChecklistMockup";

const features = [
  {
    title: "Multi-platform publishing",
    description:
      "Post to LinkedIn, Instagram, YouTube, Pinterest, TikTok, X (Twitter), Threads, and Bluesky from one place. Connect the accounts you use and publish everywhere with one click.",
    mockup: <PlatformToggleMockup />,
  },
  {
    title: "Scheduling",
    description:
      "Plan your content in advance. Set a date and time for each post and we'll publish it for you—no need to be online when it goes out.",
    mockup: <CalendarMockup />,
  },
  {
    title: "Content types",
    description:
      "Create text posts, image posts, video posts, and threads. We support the formats each platform needs and keep your content looking right everywhere.",
    mockup: <PostComposerMockup />,
  },
  {
    title: "Security",
    description:
      "Your connected account tokens are encrypted and stored securely. We only request the minimum permissions needed. You can disconnect or delete your data anytime.",
    mockup: <SecurityChecklistMockup />,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-16 sm:py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <RevealSection>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground text-center mb-4">
            Everything you need
          </h2>
          <p className="text-base text-muted-foreground text-center max-w-xl mx-auto mb-12 font-medium">
            One dashboard to create, schedule, and publish across your social
            accounts.
          </p>
        </RevealSection>
        <div className="space-y-16">
          {features.map((feature, i) => (
            <RevealSection
              key={feature.title}
              delay={i < 3 ? (i as 0 | 1 | 2) : 0}
            >
              <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
                <div className={i % 2 === 1 ? "md:order-2" : ""}>
                  <h3 className="text-xl font-bold text-foreground mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-base text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <div
                  className={i % 2 === 1 ? "md:order-1" : ""}
                  style={{ minWidth: "50%" }}
                >
                  {feature.mockup}
                </div>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}
