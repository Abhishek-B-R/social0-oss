"use client";

import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSession } from "@/lib/auth-client";

export function LandingHeader() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 shadow-sm backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="relative h-9 w-9 block">
            <Image
              src="/logo.png"
              alt="Social0"
              width={36}
              height={36}
              className="rounded-lg dark:hidden"
            />
            <Image
              src="/logo-dark.png"
              alt="Social0"
              width={36}
              height={36}
              className="rounded-lg hidden dark:block absolute inset-0"
            />
          </span>
          <span className="font-semibold text-lg text-foreground">Social0</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-8">
          <Link
            href="/#features"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </Link>
          <Link
            href="/#pricing"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/terms"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle variant="simple" />
          {session?.user ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2.5 rounded-full border border-border bg-white dark:bg-card text-foreground font-medium py-2 px-4 text-sm shadow-sm hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors shrink-0"
            >
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  width={28}
                  height={28}
                  className="rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                  {(session.user.name || session.user.email || "U")
                    .charAt(0)
                    .toUpperCase()}
                </span>
              )}
              <span className="text-gray-800 dark:text-gray-200 truncate max-w-[140px]">
                {session.user.name || session.user.email || "Account"}
              </span>
            </Link>
          ) : (
            <Link
              href="/auth"
              className="bg-accent hover:bg-accent-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm shrink-0 shadow-md"
            >
              Try it free
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
