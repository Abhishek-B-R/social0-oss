
import { useSearchParams } from "react-router-dom";
import { OtpInputs } from "@/components/ui/OtpInputs";
import { OTP_LENGTH } from "@/lib/otp";
import { useState, useEffect, Suspense } from "react";
import Link from "@/components/AppLink";
import { authClient } from "@/lib/auth-client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { toast } from "sonner";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";

const RESEND_COOLDOWN_SEC = 30;

function VerifyEmailContent() {
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get("email") ?? "";
  const [email] = useState(decodeURIComponent(emailParam));
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpString = otp.join("");


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
      window.location.href = "/auth/continue";
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


  return (
    <div className="landing landing-page flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <AuthBrandHeader />

      <main className="relative flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
            <div className="rounded-[22px] border border-border/60 bg-background p-7 dark:border-white/5 dark:bg-[#111111] sm:p-9">
              <div className="mb-6 text-center">
                <h1 className="mb-2 font-sans text-[clamp(24px,3.5vw,32px)] font-bold leading-tight tracking-tight text-foreground dark:text-white">
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
                  <OtpInputs
                    digits={otp}
                    onChange={setOtp}
                    inputClassName={"w-11 h-12 text-center text-lg font-semibold rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"}
                  />
                </div>
                <button
                  type="submit"
                  disabled={
                    verifying || resending || otpString.length !== OTP_LENGTH
                  }
                  className="inline-flex w-full items-center justify-center rounded-[10px] bg-emerald-500 px-4 py-3 font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 disabled:opacity-50 active:scale-[0.98]"
                >
                  {verifying ? "Verifying…" : "Verify"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || resending}
                  className="text-sm font-medium text-emerald-700 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400"
                >
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : resending
                      ? "Sending…"
                      : "Resend code"}
                </button>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link
              href="/auth"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
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
