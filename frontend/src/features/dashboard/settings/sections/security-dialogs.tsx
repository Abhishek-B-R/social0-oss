import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OtpInputs } from "@/components/ui/OtpInputs";
import { OTP_LENGTH, otpDigitsOf } from "@/lib/otp";
import { fetchApi } from "@/lib/fetch-api";
import { authClient } from "@/lib/auth-client";
import { deleteAccount } from "@/api/settings";
import { resetVemetricUser } from "@/lib/vemetric";
import { cn } from "@/lib/utils";
import { FieldError, settingsInputClass } from "../settings-ui";

async function apiError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string | { message?: string };
    message?: string;
  };
  return typeof data.error === "string"
    ? data.error
    : (data.error?.message ?? data.message ?? fallback);
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          className={cn(settingsInputClass, "pr-10")}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

/** Current + new password. Signs nothing else out. */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("Your new password needs at least 8 characters.");
    if (next !== confirm) return setError("The new passwords don't match.");
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        // Sign out every other device: a password change is how a user
        // shuts out someone holding a stolen session.
        revokeOtherSessions: true,
      });
      if (err) {
        setError(err.message ?? "Couldn't change your password. Check your current password.");
        return;
      }
      toast.success("Password changed");
      reset();
      onOpenChange(false);
    } catch {
      setError("Couldn't change your password. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (loading) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Enter your current password, then pick a new one.</DialogDescription>
        </DialogHeader>
        <form id="settings-change-password" onSubmit={(e) => void submit(e)} className="space-y-3">
          <PasswordField
            id="settings-current-password"
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            autoFocus
          />
          <PasswordField
            id="settings-new-password"
            label="New password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
          />
          <PasswordField
            id="settings-confirm-password"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          <FieldError>{error}</FieldError>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={loading}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form="settings-change-password" disabled={loading}>
            {loading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {loading ? "Changing…" : "Change password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RESEND_COOLDOWN_SEC = 30;

/** New email → 6-digit code sent to it → verify. */
export function ChangeEmailDialog({
  open,
  onOpenChange,
  currentEmail,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
  onChanged: (email: string) => void;
}) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  const reset = () => {
    setStep("email");
    setNewEmail("");
    setOtp("");
    setError(null);
    setCooldown(0);
  };

  const sendCode = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || email === currentEmail.trim().toLowerCase()) {
      setError("Enter a different email address.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetchApi("/api/account/change-email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: email }),
      });
      if (!res.ok) {
        setError(await apiError(res, "Couldn't send the code. Try again."));
        return;
      }
      setOtp("");
      setStep("otp");
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch {
      setError("Couldn't send the code. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    const email = newEmail.trim().toLowerCase();
    if (otp.trim().length !== OTP_LENGTH) {
      setError("Enter the 6-digit code we sent.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetchApi("/api/account/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: email, otp: otp.trim() }),
      });
      if (!res.ok) {
        setError(await apiError(res, "That code is wrong or expired. Send a new one."));
        return;
      }
      void authClient.getSession({ query: { disableCookieCache: true } });
      toast.success("Email changed", { description: `You'll sign in with ${email} from now on.` });
      onChanged(email);
      reset();
      onOpenChange(false);
    } catch {
      setError("Couldn't change your email. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (loading) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change email</DialogTitle>
          <DialogDescription>
            {step === "email"
              ? "We'll send a 6-digit code to the new address to confirm it's yours."
              : (
                <>
                  Enter the code we sent to <strong className="text-text">{newEmail.trim()}</strong>.
                </>
              )}
          </DialogDescription>
        </DialogHeader>
        <form
          id="settings-change-email"
          onSubmit={(e) => {
            e.preventDefault();
            void (step === "email" ? sendCode() : verify());
          }}
          className="space-y-3"
        >
          {step === "email" ? (
            <div className="space-y-1.5">
              <Label htmlFor="settings-new-email">New email</Label>
              <input
                id="settings-new-email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@example.com"
                className={settingsInputClass}
              />
            </div>
          ) : (
            <>
              <div className="flex justify-center gap-2" role="group" aria-label="Verification code">
                <OtpInputs
                  digits={otpDigitsOf(otp)}
                  onChange={(d) => {
                    setOtp(d.join(""));
                    setError(null);
                  }}
                  inputClassName="h-12 w-11 rounded-lg border border-input bg-bg text-center text-lg font-semibold text-text focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <p className="text-center text-sm">
                {cooldown > 0 ? (
                  <span className="text-text-muted">You can resend in {cooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void sendCode()}
                    disabled={loading}
                    className="font-medium text-accent hover:underline"
                  >
                    Send a new code
                  </button>
                )}
              </p>
            </>
          )}
          <FieldError>{error}</FieldError>
        </form>
        <DialogFooter>
          {step === "otp" ? (
            <Button variant="outline" disabled={loading} onClick={() => setStep("email")}>
              Back
            </Button>
          ) : (
            <DialogClose asChild>
              <Button variant="outline" disabled={loading}>
                Cancel
              </Button>
            </DialogClose>
          )}
          <Button
            type="submit"
            form="settings-change-email"
            disabled={loading || (step === "otp" && otp.trim().length !== OTP_LENGTH)}
          >
            {loading ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {step === "email" ? (loading ? "Sending…" : "Send code") : loading ? "Checking…" : "Verify and change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Revokes every session (this one too) and returns to the home page. */
export function SignOutEverywhereDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const { error } = await authClient.revokeSessions();
      if (error) {
        toast.error("Couldn't sign out your devices", {
          description: error.message ?? "Try again in a moment.",
        });
        setLoading(false);
        return;
      }
      await resetVemetricUser();
      await authClient.signOut();
      window.location.href = "/";
    } catch {
      toast.error("Couldn't sign out your devices", { description: "Try again in a moment." });
      setLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign out of all devices?</DialogTitle>
          <DialogDescription>
            Every browser and app signed in to Social0 is signed out, including this one.
            Scheduled posts still go out. API keys keep working.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={loading}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={() => void run()} disabled={loading}>
            {loading ? "Signing out…" : "Sign out everywhere"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Type your email to confirm. Consequences are spelled out first. */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase() && !!email.trim();

  const run = async () => {
    if (!matches || loading) return;
    setLoading(true);
    try {
      // The server's guard word; the email check above is the user-facing one.
      const result = await deleteAccount("DELETE");
      if (!result.success) {
        toast.error("Couldn't delete your account", { description: result.error });
        setLoading(false);
        return;
      }
      try {
        await resetVemetricUser();
        await authClient.signOut();
      } catch {
        /* session may already be gone */
      }
      toast.success("Your account was deleted.");
      window.location.href = "/";
    } catch {
      toast.error("Couldn't delete your account", {
        description: "Try again, or email privacy@social0.app.",
      });
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (loading) return;
        if (!o) setTyped("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>This can't be undone. Deleting your account:</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>Signs you out everywhere and cancels your subscription.</li>
          <li>Disconnects every account you connected and removes your posting schedule and queue.</li>
          <li>Deletes teams you own, with their workspaces, members and invites.</li>
          <li>Revokes your API keys and webhooks, so AI agents stop working.</li>
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="settings-delete-confirm">
            Type <span className="font-semibold text-text">{email}</span> to confirm
          </Label>
          <input
            id="settings-delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void run();
              }
            }}
            className={settingsInputClass}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={loading}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" disabled={!matches || loading} onClick={() => void run()}>
            {loading ? "Deleting…" : "Delete my account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
