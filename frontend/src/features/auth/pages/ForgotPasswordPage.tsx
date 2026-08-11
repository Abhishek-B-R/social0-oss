import { useNavigate } from "react-router-dom";
import { useState } from "react";
import Link from "@/components/AppLink";
import { authClient } from "@/lib/auth-client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { toast } from "sonner";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
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
        toast.error(friendlyAuthError(err));
        return;
      }
      toast.success("If an account exists, we sent a reset code.");
      navigate(
        `/auth/reset-password?email=${encodeURIComponent(normalizedEmail)}`,
      );
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing landing-page flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <AuthBrandHeader />

      <main className="relative flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
            <div className="rounded-[22px] border border-border/60 bg-background p-7 dark:border-white/5 dark:bg-[#111111] sm:p-9">
              <div className="mb-6 text-center">
                <h1 className="mb-2 font-sans text-[clamp(24px,3.5vw,32px)] font-bold leading-tight tracking-tight text-foreground dark:text-white">
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
                    className="mb-1.5 block text-sm font-medium text-foreground"
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
                    className="w-full rounded-[10px] border border-border bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-[#0A0A0A]"
                    placeholder="you@example.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-[10px] bg-emerald-500 px-4 py-3 font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 disabled:opacity-50 active:scale-[0.98]"
                >
                  {loading ? "Sending…" : "Send reset code"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                <Link
                  href="/auth"
                  className="font-medium text-emerald-700 transition-opacity hover:opacity-80 dark:text-emerald-400"
                >
                  Back to sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
