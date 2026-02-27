"use client";

import Link from "next/link";
import Image from "next/image";
import { signIn } from "@/lib/auth-client";

export function LandingHeader() {
  const handleTryFree = () => {
    signIn.social({
      provider: "google",
      callbackURL: "/dashboard/create",
    });
  };

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
            href="#features"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </Link>
          <Link
            href="#pricing"
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
        <button
          onClick={handleTryFree}
          className="bg-accent hover:bg-accent-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm shrink-0 shadow-md"
        >
          Try it free
        </button>
      </div>
    </header>
  );
}
