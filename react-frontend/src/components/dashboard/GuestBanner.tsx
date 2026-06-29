"use client";

import Link from "@/components/AppLink";
import { usePathname } from "@/lib/router";
import { signInUrl } from "@/lib/sign-in-url";

export function GuestBanner() {
  const pathname = usePathname();
  const href = signInUrl(pathname);

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-foreground">
        You&apos;re browsing as a guest. Sign in to connect accounts and start
        posting.
      </p>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        Sign in
      </Link>
    </div>
  );
}
