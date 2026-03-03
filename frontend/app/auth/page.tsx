"use client";

import Link from "next/link";
import Image from "next/image";
import { FcGoogle } from "react-icons/fc";
import { signIn } from "@/lib/auth-client";

export default function AuthPage() {
  const handleGoogleSignIn = () => {
    signIn.social({
      provider: "google",
      callbackURL: "/dashboard/composer",
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-foreground">
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
                className="rounded-full hidden dark:block absolute inset-0 border border-white"
              />
            </span>
            <span className="font-semibold text-lg text-foreground">
              Social0
            </span>
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
        </div>
      </header>

      <main className="flex-1 relative flex items-center justify-center px-4 py-12">
        <div className="absolute inset-0 bg-gradient-radial from-emerald-100/50 via-emerald-50/30 to-transparent pointer-events-none dark:from-emerald-950/30 dark:via-emerald-950/15" />
        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card shadow-xl p-8 sm:p-10">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Sign in to Social0
              </h1>
              <p className="text-sm text-muted-foreground">
                Plan, schedule, and publish to all your social accounts in one
                place. Continue with Google to get started.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full inline-flex items-center justify-center gap-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-4 shadow-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <FcGoogle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>Continue with Google</span>
            </button>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link
              href="/terms"
              className="underline hover:text-foreground transition-colors"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="underline hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
          <span className="mx-2">·</span>
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
}
