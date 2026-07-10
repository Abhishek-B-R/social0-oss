
import { useSearchParams } from "react-router-dom";
import { useState, useCallback, useEffect, Suspense } from "react";
import Link from "@/components/AppLink";
import { authClient } from "@/lib/auth-client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { toast } from "sonner";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

const RESEND_COOLDOWN_SEC = 30;
const OTP_LENGTH = 6;

function VerifyEmailContent() {
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get("email") ?? "";
  const [email] = useState(decodeURIComponent(emailParam));
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((c) => (c <= 1 ? 0 : c - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpString.length !== OTP_LENGTH) return;
    toast.dismiss();
    setVerifying(true);
    try {
      const { error: err } = await authClient.emailOtp.verifyEmail({
        email: email.trim().toLowerCase(),
        otp: otpString,
      });
      if (err) {
        toast.error(friendlyAuthError(err));
        return;
      }
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    toast.dismiss();
    setResending(true);
    try {
      const { error: err } = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: "email-verification",
      });
      if (err) {
        toast.error(friendlyAuthError(err));
        return;
      }
      toast.success("Code sent. Check your email.");
      setResendCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <div className="landing flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
        <main className="flex flex-1 items-center justify-center px-4">
          <p className="text-muted-foreground">
            Missing email.{" "}
            <Link href="/auth" className="text-accent hover:opacity-80 hover:underline">
              Sign up again
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
                Verify your email
              </h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                We sent a 6-digit code to{" "}
                <strong className="text-foreground">{email}</strong>
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-6">
              <div
                className="flex justify-center gap-2"
                role="group"
                aria-label="Verification code"
              >
                {inputs}
              </div>
              <button
                type="submit"
                disabled={
                  verifying || resending || otpString.length !== OTP_LENGTH
                }
                className="w-full rounded-[10px] bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium py-3 px-4 transition-colors"
              >
                {verifying ? "Verifying…" : "Verify"}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || resending}
                className="text-sm font-medium text-accent hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : resending
                    ? "Sending…"
                    : "Resend code"}
              </button>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            <Link
              href="/auth"
              className="underline hover:text-foreground transition-colors"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function VerifyEmailFallback() {
  return (
    <div className="landing flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
