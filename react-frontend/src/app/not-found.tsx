import Link from "next/link";
import Image from "next/image";
import { FileQuestion } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col bg-bg text-text"
      suppressHydrationWarning
    >
      <header className="border-b border-border bg-bg/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-bg"
          >
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
            <span className="font-semibold text-lg text-text">Social0</span>
          </Link>
          <ThemeToggle variant="simple" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bg-muted border border-border text-text-muted mb-6">
            <FileQuestion className="w-8 h-8" aria-hidden />
          </div>
          <p className="text-6xl sm:text-7xl font-bold tabular-nums text-text tracking-tight">
            404
          </p>
          <h1 className="mt-3 text-xl sm:text-2xl font-semibold text-text">
            Page not found
          </h1>
          <p className="mt-2 text-sm sm:text-base text-text-muted max-w-sm mx-auto">
            This page doesn’t exist or was moved. Head back to get on track.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-bg transition-colors"
            >
              Go to home
            </Link>
            <Link
              href="/auth"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-border bg-bg px-5 py-2.5 text-sm font-semibold text-text hover:bg-bg-muted focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-bg transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
