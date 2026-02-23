"use client";

import Link from "next/link";
import Image from "next/image";
import { signIn } from "@/lib/auth-client";

export function LandingHeader() {
  const handleTryFree = () => {
    signIn.social({
      provider: "google",
      callbackURL: "/dashboard/posts/new",
    });
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src="/logo.png"
            alt="Social0"
            width={36}
            height={36}
            className="rounded-lg"
          />
          <span className="font-semibold text-lg text-gray-900">Social0</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-8">
          <Link
            href="#features"
            className="text-gray-700 hover:text-gray-900 text-sm font-medium transition-colors"
          >
            Features
          </Link>
          <Link
            href="#pricing"
            className="text-gray-700 hover:text-gray-900 text-sm font-medium transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/terms"
            className="text-gray-700 hover:text-gray-900 text-sm font-medium transition-colors"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="text-gray-700 hover:text-gray-900 text-sm font-medium transition-colors"
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
