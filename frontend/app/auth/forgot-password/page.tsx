"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.dismiss();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await authClient.emailOtp.requestPasswordReset({
        email: normalizedEmail,
      });
      if (err) {
        toast.error(err.message ?? "Something went wrong. Try again.");
        return;
      }
      router.push(
        `/auth/reset-password?email=${encodeURIComponent(normalizedEmail)}`,
      );
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
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
        </div>
      </header>

      <main className="flex-1 relative flex items-center justify-center px-4 py-12">
        <div className="absolute inset-0 bg-gradient-radial from-emerald-100/50 via-emerald-50/30 to-transparent pointer-events-none dark:from-emerald-950/30 dark:via-emerald-950/15" />
        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card shadow-xl p-8 sm:p-10">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Forgot password?
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a code to reset your
                password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="you@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-3 px-4 transition-colors"
              >
                {loading ? "Sending…" : "Send reset code"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Link
                href="/auth"
                className="text-emerald-600 hover:text-emerald-700"
              >
                Back to sign in
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
