"use client";

import { useState } from "react";
import Link from "@/components/AppLink";
import { useRouter } from "@/lib/router";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

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
        toast.error("Something went wrong. Try again.");
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
    <div className="landing flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <AuthBrandHeader />

      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="absolute inset-0 bg-gradient-radial from-emerald-100/50 via-emerald-50/30 to-transparent pointer-events-none dark:from-emerald-950/30 dark:via-emerald-950/15" />
        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card shadow-xl p-8 sm:p-10">
            <div className="mb-6 text-center">
              <h1 className="mb-2 font-serif text-[clamp(24px,3vw,32px)] leading-tight tracking-tight text-foreground">
                Forgot password?
              </h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
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
                className="w-full rounded-[10px] bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium py-3 px-4 transition-colors"
              >
                {loading ? "Sending…" : "Send reset code"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Link
                href="/auth"
                className="text-accent hover:opacity-80"
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
