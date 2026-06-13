"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FcGoogle } from "react-icons/fc";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { Turnstile } from "@marsidev/react-turnstile";
import { signIn } from "@/lib/auth-client";
import { resolveCallbackUrl } from "@/lib/sign-in-url";
import { toast } from "sonner";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
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

function friendlyAuthError(err: unknown): string {
  const msg =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
  const lower = msg.toLowerCase();
  if (
    lower.includes("timeout") ||
    lower.includes("aborted") ||
    lower.includes("abort")
  ) {
    return "Request timed out. Please try again.";
  }
  if (
    lower.includes("invalid") ||
    lower.includes("incorrect") ||
    lower.includes("wrong password") ||
    lower.includes("credentials")
  ) {
    return "Invalid email or password.";
  }
  if (
    lower.includes("already exists") ||
    lower.includes("already registered") ||
    lower.includes("email taken") ||
    lower.includes("duplicate")
  ) {
    return "An account with this email already exists.";
  }
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("failed to fetch") ||
    lower.includes("database") ||
    lower.includes("internal")
  ) {
    return "Something went wrong. Please try again later.";
  }
  return "Something went wrong. Please try again later.";
}

function AuthPageContent() {
  const searchParams = useSearchParams();
  const callbackUrl = resolveCallbackUrl(searchParams.get("callbackUrl"));
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [resetSuccess, setResetSuccess] = useState(false);
  useEffect(() => {
    if (searchParams.get("reset") === "success") setResetSuccess(true);
  }, [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    // Safety timeout: stop spinner if popup/redirect is blocked, but avoid noisy false errors.
    const timer = setTimeout(() => {
      setGoogleLoading(false);
    }, 15000);
    try {
      const { error } = await signIn.social({
        provider: "google",
        callbackURL: callbackUrl,
      });
      // If we actually got an error payload (no redirect happened), show it.
      if (error) {
        toast.error(friendlyAuthError(error.message ?? error));
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const checkRes = await fetch(
        `/api/auth/check-email?email=${encodeURIComponent(normalizedEmail)}`,
        { credentials: "include", signal: controller.signal },
      );
      const checkData = (await checkRes.json().catch(() => ({}))) as {
        exists?: boolean;
      };
      if (checkData.exists === false) {
        toast.error("No account found with this email. Please sign up first.");
        return;
      }
      const { error: err } = await signIn.email({
        email: normalizedEmail,
        password,
        callbackURL: callbackUrl,
      });
      if (err) {
        toast.error(friendlyAuthError(err.message ?? err));
        return;
      }
      window.location.href = callbackUrl;
    } catch (err) {
      const isTimeout =
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.message.toLowerCase().includes("abort"));
      toast.error(
        isTimeout
          ? "Request timed out. Please try again."
          : "Something went wrong. Please try again later.",
      );
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.dismiss();
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error("Please complete the verification");
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const signUpUrl = TURNSTILE_SITE_KEY
        ? "/api/auth/sign-up-with-turnstile"
        : "/api/auth/sign-up";
      const body = TURNSTILE_SITE_KEY
        ? {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            turnstileToken,
          }
        : { name: name.trim(), email: email.trim().toLowerCase(), password };
      const res = await fetch(signUpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.redirected && res.url) {
        window.location.href = res.url;
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string | { message?: string };
          message?: string;
        };
        const raw =
          typeof data.error === "string"
            ? data.error
            : (data.error?.message ?? data.message ?? "");
        toast.error(friendlyAuthError(raw));
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
      } else {
        window.location.href = `/auth/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`;
      }
    } catch (err) {
      const isTimeout =
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.message.toLowerCase().includes("abort"));
      toast.error(
        isTimeout
          ? "Request timed out. Please try again."
          : "Something went wrong. Please try again later.",
      );
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <AuthBrandHeader showNav />

      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <h1 className="sr-only">Sign in to Social0</h1>
        <div className="absolute inset-0 bg-gradient-radial from-emerald-100/50 via-emerald-50/30 to-transparent pointer-events-none dark:from-emerald-950/30 dark:via-emerald-950/15" />
        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card shadow-xl p-8 sm:p-10">
            <div className="mb-6 text-center">
              <h2 className="mb-2 font-serif text-[clamp(24px,3vw,32px)] leading-tight tracking-tight text-foreground">
                {mode === "signin" ? "Sign in to Social0" : "Create an account"}
              </h2>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                {mode === "signin"
                  ? "Plan, schedule, and publish to all your social accounts from one place."
                  : "Get started with email or continue with Google."}
              </p>
            </div>

            <div className="flex rounded-lg border border-border bg-muted/30 p-1 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  toast.dismiss();
                }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  mode === "signin"
                    ? "bg-background text-foreground shadow-sm"
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
                }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  mode === "signup"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign up
              </button>
            </div>

            {resetSuccess && (
              <p className="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm py-2 px-3 mb-4">
                Password reset successfully. You can sign in with your new
                password.
              </p>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-border bg-background hover:bg-muted/50 disabled:opacity-60 text-foreground font-medium py-3 px-4 transition-colors"
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
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase tracking-widest">
                <span className="bg-card px-2 text-muted-foreground">
                  OR CONTINUE WITH EMAIL
                </span>
              </div>
            </div>
            {mode === "signin" ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label
                    htmlFor="signin-email"
                    className="block text-sm font-medium text-foreground mb-1"
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
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="signin-password"
                      className="block text-sm font-medium text-foreground"
                    >
                      Password
                    </label>
                    <Link
                      href="/auth/forgot-password"
                      className="text-sm text-accent hover:opacity-80"
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
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <IconEyeOff className="h-4 w-4" />
                      ) : (
                        <IconEye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium py-3 px-4 transition-colors"
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
                    className="block text-sm font-medium text-foreground mb-1"
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
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label
                    htmlFor="signup-email"
                    className="block text-sm font-medium text-foreground mb-1"
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
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-sm font-medium text-foreground mb-1"
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
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <IconEyeOff className="h-4 w-4" />
                      ) : (
                        <IconEye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                {TURNSTILE_SITE_KEY && (
                  <div className="flex justify-center">
                    <Turnstile
                      siteKey={TURNSTILE_SITE_KEY}
                      onSuccess={(token) => setTurnstileToken(token)}
                      onExpire={() => setTurnstileToken(null)}
                      onError={() => setTurnstileToken(null)}
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={
                    loading ||
                    googleLoading ||
                    (!!TURNSTILE_SITE_KEY && !turnstileToken)
                  }
                  className="w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium py-3 px-4 transition-colors"
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

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <Link
              href="/"
              className="underline hover:text-foreground transition-colors"
            >
              Back to homepage
            </Link>
            <span className="text-border">·</span>
            <Link
              href="/privacy"
              className="underline hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="text-border">·</span>
            <Link
              href="/terms"
              className="underline hover:text-foreground transition-colors"
            >
              Terms of Service
            </Link>
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

function AuthPageFallback() {
  return (
    <div className="flex min-h-screen flex-col">
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
