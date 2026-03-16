import {
  XIcon,
  InstagramIcon,
  LinkedInIcon,
  BlueskyIcon,
  ThreadsIcon,
} from "@/components/landing/PlatformIcons";

const connectedAccounts = [
  {
    name: "Main Brand",
    handle: "@social0app",
    icon: XIcon,
    color: "#000000",
    darkColor: "#ffffff",
  },
  {
    name: "Personal",
    handle: "@yourhandle",
    icon: InstagramIcon,
    color: "#E1306C",
    darkColor: "#E1306C",
  },
  {
    name: "Company",
    handle: "Social0 Inc",
    icon: LinkedInIcon,
    color: "#0077B5",
    darkColor: "#0077B5",
  },
  {
    name: "Dev Updates",
    handle: "@social0dev",
    icon: BlueskyIcon,
    color: "#0560FF",
    darkColor: "#0560FF",
  },
];

const targetPlatforms = [
  { icon: XIcon, name: "Twitter" },
  { icon: BlueskyIcon, name: "Bluesky" },
  { icon: LinkedInIcon, name: "LinkedIn" },
  { icon: ThreadsIcon, name: "Threads" },
];

const stats = [
  { value: "24", label: "Posts this month" },
  { value: "9", label: "Platforms" },
  { value: "4.2k", label: "Total reach" },
];

export function DashboardMockup() {
  return (
    <section
      className="px-6 pb-24 lg:px-8"
      aria-label="Social0 dashboard showing post scheduling across multiple platforms"
    >
      <div className="mx-auto max-w-[1100px]">
        {/* Light mode: dark mockup, Dark mode: light mockup */}
        <div className="mt-16 overflow-hidden rounded-2xl border border-black/[0.08] bg-[#0A0A0A] shadow-[0_40px_80px_rgba(0,0,0,0.18)] dark:border-border dark:bg-[#FAFAF8] dark:shadow-[0_40px_80px_rgba(0,0,0,0.4)]">
          {/* Fake browser bar */}
          <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#141414] px-5 py-3.5 dark:border-black/[0.06] dark:bg-[#F0EEE9]">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#28CA41]" />
            </div>
            <div className="ml-3 rounded bg-white/[0.05] px-3 py-1 font-mono text-[11px] text-white/25 dark:bg-black/[0.05] dark:text-black/30">
              social0.app/dashboard
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid gap-6 p-6 md:grid-cols-[260px_1fr]">
            {/* Sidebar — connected accounts */}
            <div className="hidden rounded-xl border border-white/[0.06] bg-[#141414] p-4 dark:border-black/[0.06] dark:bg-[#F0EEE9] md:block">
              <div className="mb-4 text-[10px] font-medium uppercase tracking-widest text-white/25 dark:text-black/40">
                Connected
              </div>
              <div className="space-y-3">
                {connectedAccounts.map((account) => (
                  <div key={account.handle} className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#000] dark:bg-[#000]"
                      style={{ background: account.color }}
                    >
                      <account.icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-white/80 dark:text-black/80">
                        {account.name}
                      </div>
                      <div className="truncate text-[11px] text-white/30 dark:text-black/40">
                        {account.handle}
                      </div>
                    </div>
                    <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  </div>
                ))}
              </div>
            </div>

            {/* Composer + stats */}
            <div className="space-y-4">
              {/* Composer box */}
              <div className="rounded-xl border border-white/[0.06] bg-[#141414] p-5 dark:border-black/[0.06] dark:bg-[#F0EEE9]">
                <p className="mb-4 text-[14px] leading-relaxed text-white/80 dark:text-black/80">
                  Just shipped parallel publishing — all 9 platforms fire
                  simultaneously now. No queue, no waiting. If one fails the
                  others still go through.
                </p>
                <p className="mb-4 text-[14px] text-blue-400 dark:text-blue-600">
                  #buildinpublic #indiehacker #saas
                </p>

                {/* Platform target pills with real icons */}
                <div className="mb-4 flex flex-wrap gap-2">
                  {targetPlatforms.map((platform) => (
                    <span
                      key={platform.name}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-white/60 dark:bg-black/[0.06] dark:text-black/60"
                    >
                      <platform.icon className="h-3 w-3" />
                      {platform.name}
                    </span>
                  ))}
                </div>

                {/* Bottom row */}
                <div className="flex items-center justify-between">
                  <span className="rounded bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-white/25 dark:bg-black/[0.05] dark:text-black/40">
                    Tomorrow 9:00 AM IST
                  </span>
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white"
                  >
                    Publish now
                  </button>
                </div>
              </div>

              {/* Three stat boxes */}
              <div className="grid grid-cols-3 gap-3">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-white/[0.06] bg-[#141414] p-4 dark:border-black/[0.06] dark:bg-[#F0EEE9]"
                  >
                    <div className="mb-1 font-mono text-[24px] font-medium text-white/90 dark:text-black/90">
                      {stat.value}
                    </div>
                    <div className="text-[11px] text-white/30 dark:text-black/40">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
