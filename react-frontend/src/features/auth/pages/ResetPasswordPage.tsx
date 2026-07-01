
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { useState, useCallback, Suspense } from "react";
import Link from "@/components/AppLink";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

const OTP_LENGTH = 6;

function ResetPasswordContent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const invalidateQueries = useInvalidateQueries();
  const emailParam = searchParams.get("email") ?? "";
  const [email] = useState(decodeURIComponent(emailParam));
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const otpString = otp.join("");

  const setOtpFromString = useCallback((s: string) => {
    const digits = s.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
    setOtp((prev) => {
      const next = [...prev];
      digits.forEach((d, i) => {
        next[i] = d;
      });
      return next;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.dismiss();
    if (otpString.length !== OTP_LENGTH) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await authClient.emailOtp.resetPassword({
        email: email.trim().toLowerCase(),
        otp: otpString,
        password,
      });
      if (err) {
        toast.error("Invalid or expired code. Try again.");
        return;
      }
      navigate("/auth?reset=success", { replace: true });
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="landing flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
        <main className="flex flex-1 items-center justify-center px-4">
          <p className="text-muted-foreground">
            Missing email.{" "}
            <Link
              href="/auth/forgot-password"
              className="text-accent hover:opacity-80 hover:underline"
            >
              Request a reset
            </Link>
            .
          </p>
        </main>
      </div>
    );
  }

  const inputs = otp.map((digit, i) => (
    <input
      key={i}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={1}
      value={digit}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "");
        if (v.length <= 1) {
          setOtp((prev) => {
            const next = [...prev];
            next[i] = v;
            return next;
          });
          if (v && i < OTP_LENGTH - 1) {
            const nextEl = e.target
              .nextElementSibling as HTMLInputElement | null;
            nextEl?.focus();
          }
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const pasted = e.clipboardData
          .getData("text")
          .replace(/\D/g, "")
          .slice(0, OTP_LENGTH);
        setOtpFromString(pasted);
        const firstEmpty = Math.min(pasted.length, OTP_LENGTH - 1);
        const el =
          e.currentTarget.parentElement?.querySelectorAll("input")[firstEmpty];
        el?.focus();
      }}
      onKeyDown={(e) => {
        if (e.key === "Backspace" && !otp[i] && i > 0) {
          const prev = e.currentTarget
            .previousElementSibling as HTMLInputElement | null;
          prev?.focus();
        }
      }}
      className="w-11 h-12 text-center text-lg font-semibold rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
      aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
    />
  ));

  return (
    <div className="landing flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <AuthBrandHeader />

      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="absolute inset-0 bg-gradient-radial from-emerald-100/50 via-emerald-50/30 to-transparent pointer-events-none dark:from-emerald-950/30 dark:via-emerald-950/15" />
        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card shadow-xl p-8 sm:p-10">
            <div className="mb-6 text-center">
              <h1 className="mb-2 font-serif text-[clamp(24px,3vw,32px)] leading-tight tracking-tight text-foreground">
                Reset password
              </h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                Enter the 6-digit code we sent to{" "}
                <strong className="text-foreground">{email}</strong> and choose
                a new password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div
                className="flex justify-center gap-2"
                role="group"
                aria-label="Verification code"
              >
                {inputs}
              </div>
              <div>
                <label
                  htmlFor="reset-password"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  New password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label
                  htmlFor="reset-confirm"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Confirm new password
                </label>
                <input
                  id="reset-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Confirm password"
                />
              </div>
              <button
                type="submit"
                disabled={
                  loading ||
                  otpString.length !== OTP_LENGTH ||
                  password.length < 8 ||
                  password !== confirmPassword
                }
                className="w-full rounded-[10px] bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium py-3 px-4 transition-colors"
              >
                {loading ? "Resetting…" : "Reset password"}
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

function ResetPasswordFallback() {
  return (
    <div className="landing flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
