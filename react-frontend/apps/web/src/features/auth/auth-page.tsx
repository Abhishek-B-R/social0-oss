import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Turnstile } from "@marsidev/react-turnstile";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function AuthPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  if (session?.user) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="mb-4 text-text-muted">Signed in as {session.user.email}</p>
        <Button
          onClick={async () => {
            await signOut();
            navigate({ to: "/" });
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!turnstileToken && import.meta.env.VITE_TURNSTILE_SITE_KEY) {
          toast.error("Complete the CAPTCHA");
          return;
        }
        if (import.meta.env.VITE_TURNSTILE_SITE_KEY && turnstileToken) {
          await authService.signUpWithTurnstile({
            email,
            password,
            name,
            turnstileToken,
          });
        } else {
          await authService.signUp({ email, password, name });
        }
        toast.success("Account created — check your email");
        window.location.href = "/auth/verify-email";
        return;
      }

      const check = await authService.checkEmail(email);
      if (!check.exists) {
        toast.error("No account found for this email");
        return;
      }

      const res = await signIn.email({
        email,
        password,
        callbackURL: "/dashboard",
      });
      if (res.error) throw new Error(res.error.message);
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <Link to="/" className="text-2xl font-bold text-accent">
          Social0
        </Link>
        <p className="mt-2 text-text-muted">
          {mode === "signin" ? "Sign in to your account" : "Create your account"}
        </p>
      </div>

      <form onSubmit={handleEmailAuth} className="space-y-4 rounded-xl border border-border bg-bg-elevated p-6">
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {mode === "signup" && import.meta.env.VITE_TURNSTILE_SITE_KEY && (
          <Turnstile
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
            onSuccess={setTurnstileToken}
          />
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() =>
            void signIn.social({ provider: "google", callbackURL: "/dashboard" })
          }
        >
          Continue with Google
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-text-muted">
        {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Create account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
