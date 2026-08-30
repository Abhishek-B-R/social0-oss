import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, Suspense } from "react";
import { usePostHog } from "@posthog/react";
import Link from "@/components/AppLink";
import { FcGoogle } from "react-icons/fc";
import {
  Eye,
  EyeSlash,
} from "@/icons/phosphor";
import { signIn, useSession } from "@/lib/auth-client";
import { absoluteCallbackUrl, resolveCallbackUrl } from "@/lib/sign-in-url";
import { assignSafeRedirectUrl } from "@/lib/safe-external-url";
import {
  friendlyAuthError,
  isEmailNotVerifiedError,
  messageForAuthResponse,
} from "@/lib/auth-errors";
import { toast } from "sonner";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";
import { fetchApi } from "@/lib/fetch-api";
import { LegalConsentCheckboxes } from "@/components/auth/LegalConsentCheckboxes";
import {
  EMPTY_LEGAL_CONSENT,
  type LegalConsentValues,
} from "@/components/auth/legal-consent";

const TIMEOUT_MS = 10_000;

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function AuthPageContent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const posthog = usePostHog();
  const callbackUrl = resolveCallbackUrl(searchParams.get("callbackUrl"));
  const authCallbackUrl = absoluteCallbackUrl(callbackUrl);
  const [mode, setMode] = useState<"signin" | "signup">(() =>
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const resetSuccess = searchParams.get("reset") === "success";
  const sessionExpired = searchParams.get("session") === "expired";
  useEffect(() => {
    if (isPending || !session) return;
    if (session.user.emailVerified === false) {
      navigate(
        `/auth/verify-email?email=${encodeURIComponent(session.user.email ?? "")}`,
      );
      return;
    }
    assignSafeRedirectUrl(callbackUrl);
  }, [isPending, session, callbackUrl, navigate]);
  useEffect(() => {
    if (sessionExpired) {
      toast.error("Your session expired. Please sign in again.");
    }
  }, [sessionExpired]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [legalConsent, setLegalConsent] =
    useState<LegalConsentValues>(EMPTY_LEGAL_CONSENT);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    posthog?.capture("user_signed_in_with_google");
    // Safety timeout: stop spinner if popup/redirect is blocked, but avoid noisy false errors.
    const timer = setTimeout(() => {
      setGoogleLoading(false);
    }, 15000);
    try {
      const { error } = await signIn.social({
        provider: "google",
        callbackURL: authCallbackUrl,
      });
      // If we actually got an error payload (no redirect happened), show it.
      if (error) {
        toast.error(friendlyAuthError(error));
      }
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      clearTimeout(timer);
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.dismiss();
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const { error: err } = await signIn.email({
        email: normalizedEmail,
        password,
        callbackURL: authCallbackUrl,
      });
      if (err) {
        const msg = friendlyAuthError(err);
        toast.error(msg);
        if (isEmailNotVerifiedError(err)) {
          navigate(
            `/auth/verify-email?email=${encodeURIComponent(normalizedEmail)}`,
          );
        }
        return;
      }
      posthog?.identify(normalizedEmail, { email: normalizedEmail });
      posthog?.capture("user_signed_in", { method: "email" });
      assignSafeRedirectUrl(callbackUrl);
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.dismiss();
    if (!legalConsent.acceptTerms || !legalConsent.acceptPrivacy) {
      toast.error(
        "Please accept the Terms of Service and acknowledge the Privacy Policy.",
      );
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchApi("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          acceptTerms: legalConsent.acceptTerms,
          acceptPrivacy: legalConsent.acceptPrivacy,
          marketingOptIn: legalConsent.marketingOptIn,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        toast.error(await messageForAuthResponse(res));
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      const normalizedSignUpEmail = email.trim().toLowerCase();
      posthog?.identify(normalizedSignUpEmail, {
        email: normalizedSignUpEmail,
        name: name.trim(),
      });
      posthog?.capture("user_signed_up", { method: "email" });
      const verifyUrl =
        data.url ??
        `/auth/verify-email?email=${encodeURIComponent(normalizedSignUpEmail)}`;
      if (!assignSafeRedirectUrl(verifyUrl)) {
        window.location.href = verifyUrl;
      }
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  if (isPending || session) {
    return <AuthPageFallback />;
  }

  return (
    <div className="landing landing-page flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <AuthBrandHeader showNav />

      <main className="relative flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <h1 className="sr-only">Sign in to Social0</h1>
        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
            <div className="rounded-[22px] border border-border/60 bg-background p-7 dark:border-white/5 dark:bg-[#111111] sm:p-9">
              <div className="mb-6 text-center">
                <h2 className="mb-2 font-sans text-[clamp(24px,3.5vw,32px)] font-bold leading-tight tracking-tight text-foreground dark:text-white">
                  {mode === "signin" ? (
                    <>
                      Sign in to{" "}
                      <span className="font-logo font-normal tracking-tight">
                        Social0
                      </span>
                    </>
                  ) : (
                    "Create an account"
                  )}
                </h2>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  {mode === "signin"
                    ? "Plan, schedule, and publish to all your social accounts from one place."
                    : "Free to start — no credit card. Connect an account and schedule your first post in minutes."}
                </p>
              </div>

              <div className="mb-6 flex rounded-[10px] border border-border bg-muted/30 p-1 dark:border-white/10 dark:bg-[#151515]">
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    toast.dismiss();
                  }}
                  className={`flex-1 rounded-[8px] py-2.5 text-sm font-medium transition-colors ${
                    mode === "signin"
                      ? "bg-background text-foreground shadow-sm dark:bg-[#1A1A1A]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    toast.dismiss();
                    setLegalConsent(EMPTY_LEGAL_CONSENT);
                  }}
                  className={`flex-1 rounded-[8px] py-2.5 text-sm font-medium transition-colors ${
                    mode === "signup"
                      ? "bg-background text-foreground shadow-sm dark:bg-[#1A1A1A]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sign up
                </button>
              </div>

              {resetSuccess && (
                <p className="mb-4 rounded-[10px] bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                  Password reset successfully. You can sign in with your new
                  password.
                </p>
              )}

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="inline-flex w-full items-center justify-center gap-3 rounded-[10px] border border-border bg-background px-4 py-3 font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-60 dark:border-white/10 dark:bg-[#151515] dark:hover:bg-white/5"
              >
                {googleLoading ? (
                  <>
                    <Spinner />
                    <span>Redirecting…</span>
                  </>
                ) : (
                  <>
                    <FcGoogle className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border dark:border-white/10" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-widest">
                  <span className="bg-background px-2 text-muted-foreground dark:bg-[#111111]">
                    Or continue with email
                  </span>
                </div>
              </div>
              {mode === "signin" ? (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label
                      htmlFor="signin-email"
                      className="mb-1.5 block text-sm font-medium text-foreground"
                    >
                      Email
                    </label>
                    <input
                      id="signin-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full rounded-[10px] border border-border bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-[#0A0A0A]"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label
                        htmlFor="signin-password"
                        className="block text-sm font-medium text-foreground"
                      >
                        Password
                      </label>
                      <Link
                        href="/auth/forgot-password"
                        className="text-sm font-medium text-emerald-700 transition-opacity hover:opacity-80 dark:text-emerald-400"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        placeholder="Enter a strong password"
                        className="w-full rounded-[10px] border border-border bg-background px-3 py-2.5 pr-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-[#0A0A0A]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeSlash className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || googleLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-emerald-500 px-4 py-3 font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 active:scale-[0.98]"
                  >
                    {loading ? (
                      <>
                        <Spinner />
                        <span>Signing in…</span>
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div>
                    <label
                      htmlFor="signup-name"
                      className="mb-1.5 block text-sm font-medium text-foreground"
                    >
                      Name
                    </label>
                    <input
                      id="signup-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      className="w-full rounded-[10px] border border-border bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-[#0A0A0A]"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="signup-email"
                      className="mb-1.5 block text-sm font-medium text-foreground"
                    >
                      Email
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full rounded-[10px] border border-border bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-[#0A0A0A]"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="signup-password"
                      className="mb-1.5 block text-sm font-medium text-foreground"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="Enter a strong password"
                        className="w-full rounded-[10px] border border-border bg-background px-3 py-2.5 pr-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-white/10 dark:bg-[#0A0A0A]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeSlash className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <LegalConsentCheckboxes
                    values={legalConsent}
                    onChange={setLegalConsent}
                    idPrefix="signup"
                  />
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      googleLoading ||
                      !legalConsent.acceptTerms ||
                      !legalConsent.acceptPrivacy
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-emerald-500 px-4 py-3 font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 active:scale-[0.98]"
                  >
                    {loading ? (
                      <>
                        <Spinner />
                        <span>Creating account…</span>
                      </>
                    ) : (
                      "Create account"
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <Link
              href="/"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Back to homepage
            </Link>
            <span className="text-border">·</span>
            <Link
              href="/privacy"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <span className="text-border">·</span>
            <Link
              href="/terms"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Terms
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function AuthPageFallback() {
  return (
    <div className="landing landing-page flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <AuthPageContent />
    </Suspense>
  );
}
