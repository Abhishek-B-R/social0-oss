import type { ReactNode } from "react";
import Link from "@/components/AppLink";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

type AuthNoticeProps = {
  title: string;
  children: ReactNode;
  actionHref: string;
  actionLabel: string;
};

/**
 * Small dead-end card for auth routes opened without the data they need
 * (for example `/auth/reset-password` with no `email`). Uses the same shell,
 * header and card as the real forms so it never renders as bare text.
 */
export function AuthNotice({
  title,
  children,
  actionHref,
  actionLabel,
}: AuthNoticeProps) {
  return (
    <div className="landing landing-page flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <AuthBrandHeader />
      <main className="relative flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
            <div className="rounded-[22px] border border-border/60 bg-background p-7 text-center dark:border-white/5 dark:bg-[#111111] sm:p-9">
              <h1 className="mb-2 font-sans text-[clamp(24px,3.5vw,32px)] font-bold leading-tight tracking-tight text-foreground dark:text-white">
                {title}
              </h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                {children}
              </p>
              <Link
                href={actionHref}
                className="mt-6 inline-flex w-full items-center justify-center rounded-[10px] bg-emerald-500 px-4 py-3 font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
              >
                {actionLabel}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
