"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  IconUser,
  IconLink,
  IconCalendar,
  IconAdjustments,
} from "@tabler/icons-react";
import {
  signOutAllDevices,
  updateAutomationEmails,
  updateDisplayName,
  updatePlatformPreferences,
  updateTimezone,
  updateUserImage,
  updateConnectionAvatar,
  type SettingsSnapshot,
} from "@/app/actions/settings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PLATFORMS } from "@/lib/platforms";
import { DATE_FORMAT_OPTIONS } from "@/lib/date-format";
import { uploadFile } from "@/lib/upload-file";
import { PlatformIcon } from "@/components/PlatformIcon";
import { QueueScheduleSection } from "./QueueScheduleSection";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import DocsInfoIcon from "@/components/info-icon";
import { DOCS_SETTINGS_URL } from "@/lib/docs-url";
import { toast } from "sonner";

export type SettingsConnection = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
};

const SETTINGS_TABS = [
  { id: "profile", label: "Profile", icon: IconUser },
  { id: "preferences", label: "Preferences", icon: IconAdjustments },
  { id: "queue", label: "Queue", icon: IconCalendar },
  { id: "connections", label: "Connections", icon: IconLink },
] as const;

function SaveButton({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-accent dark:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function Toggle({
  id,
  name,
  defaultChecked,
  label,
  description,
}: {
  id: string;
  name: string;
  defaultChecked: boolean;
  label: string;
  description?: string;
}) {
  return (
    <label htmlFor={id} className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-text">{label}</p>
        {description ? (
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 h-5 w-5 rounded border-input bg-bg text-accent focus:ring-accent"
      />
    </label>
  );
}

const CHANGE_PASSWORD_FORM_ID = "change-password-form";

function PasswordInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  minLength?: number;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          className="pr-9 h-10 rounded-lg border-input bg-bg"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordForm({
  formId,
  onError,
  onSuccess,
  setLoading,
}: {
  formId: string;
  onError: (msg: string) => void;
  onSuccess: () => void;
  setLoading: (v: boolean) => void;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError("");
    if (newPassword !== confirmPassword) {
      onError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      onError("New password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (error) {
        onError(error.message ?? "Failed to change password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onSuccess();
      router.refresh();
    } catch {
      onError("Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-3 mt-2">
      <PasswordInput
        id="current-password"
        label="Current password"
        value={currentPassword}
        onChange={setCurrentPassword}
        placeholder="Enter current password"
        required
      />
      <PasswordInput
        id="new-password"
        label="New password"
        value={newPassword}
        onChange={setNewPassword}
        placeholder="At least 8 characters"
        required
        minLength={8}
      />
      <PasswordInput
        id="confirm-password"
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Confirm new password"
        required
        minLength={8}
      />
    </form>
  );
}

const OTP_LENGTH = 6;
const CHANGE_EMAIL_SEND_FORM_ID = "change-email-send-form";
const CHANGE_EMAIL_VERIFY_FORM_ID = "change-email-verify-form";

function ChangeEmailForm({
  currentEmail,
  step,
  newEmail,
  otp,
  onStepChange,
  onNewEmailChange,
  onOtpChange,
  onError,
  onSuccess,
  setLoading,
  resendCooldown,
  onResend,
}: {
  currentEmail: string;
  step: "email" | "otp";
  newEmail: string;
  otp: string;
  onStepChange: (s: "email" | "otp") => void;
  onNewEmailChange: (v: string) => void;
  onOtpChange: (v: string) => void;
  onError: (s: string | null) => void;
  onSuccess: () => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  resendCooldown?: number;
  onResend?: () => void;
}) {
  const router = useRouter();
  const setOtpFromString = useCallback(
    (s: string) => {
      const digits = s.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
      onOtpChange(digits.join(""));
    },
    [onOtpChange],
  );

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email || email === currentEmail.trim().toLowerCase()) {
      onError("Enter a new email address.");
      return;
    }
    onError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/account/change-email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newEmail: email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string | { message?: string };
        message?: string;
      };
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : (data.error?.message ?? data.message ?? "Failed to send code.");
        onError(msg);
        return;
      }
      onStepChange("otp");
    } catch {
      onError("Failed to send code.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email || otp.trim().length !== OTP_LENGTH) {
      onError("Enter the code we sent to your new email.");
      return;
    }
    onError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/account/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newEmail: email, otp: otp.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string | { message?: string };
        message?: string;
      };
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : (data.error?.message ??
              data.message ??
              "Invalid or expired code.");
        onError(msg);
        return;
      }
      onSuccess();
      router.refresh();
    } catch {
      onError("Failed to update email.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "email") {
    return (
      <form
        id={CHANGE_EMAIL_SEND_FORM_ID}
        onSubmit={handleSendOtp}
        className="space-y-3 mt-2"
      >
        <div className="space-y-2">
          <Label htmlFor="new-email">New email address</Label>
          <Input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={(e) => {
              onNewEmailChange(e.target.value);
              onError(null);
            }}
            placeholder="you@example.com"
            required
            className="h-10 rounded-lg border-input bg-bg"
          />
        </div>
      </form>
    );
  }

  const otpDigits = otp
    .split("")
    .concat(Array(OTP_LENGTH).fill(""))
    .slice(0, OTP_LENGTH);
  const otpInputs = otpDigits.map((digit, i) => (
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
          const next = otpDigits.slice();
          next[i] = v;
          onOtpChange(next.join(""));
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
        if (e.key === "Backspace" && !otpDigits[i] && i > 0) {
          const prev = e.currentTarget
            .previousElementSibling as HTMLInputElement | null;
          prev?.focus();
        }
      }}
      className="w-11 h-12 text-center text-lg font-semibold rounded-lg border border-input bg-bg text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
      aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
    />
  ));

  return (
    <form
      id={CHANGE_EMAIL_VERIFY_FORM_ID}
      onSubmit={handleConfirmEmail}
      className="space-y-3 mt-2"
    >
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to{" "}
        <strong className="text-foreground">{newEmail}</strong>
      </p>
      <div className="space-y-2">
        <Label>Verification code</Label>
        <div
          className="flex justify-center gap-2"
          role="group"
          aria-label="Verification code"
        >
          {otpInputs}
        </div>
      </div>
      {onResend != null && (
        <div className="text-sm">
          {resendCooldown != null && resendCooldown > 0 ? (
            <span className="text-muted-foreground">
              Resend code in {resendCooldown}s
            </span>
          ) : (
            <button
              type="button"
              onClick={onResend}
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Resend code
            </button>
          )}
        </div>
      )}
    </form>
  );
}

function ChangePasswordModal({
  onError,
  onSuccess,
}: {
  onError: (msg: string) => void;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) toast.dismiss();
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="rounded-xl"
      >
        Change password
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>
          <ChangePasswordForm
            formId={CHANGE_PASSWORD_FORM_ID}
            onError={(msg) => {
              toast.error(msg);
              onError(msg);
            }}
            onSuccess={() => {
              onSuccess();
              handleOpenChange(false);
            }}
            setLoading={setLoading}
          />
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="submit"
              form={CHANGE_PASSWORD_FORM_ID}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {loading && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              {loading ? "Updating…" : "Change password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const RESEND_COOLDOWN_SEC = 30;

function ChangeEmailModal({
  currentEmail,
  onSuccess,
}: {
  currentEmail: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"email" | "otp">("email");
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((c) => (c <= 1 ? 0 : c - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setStep("email");
      setNewEmail("");
      setOtp("");
      toast.dismiss();
      setResendCooldown(0);
    }
  };

  const handleSendCode = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    toast.dismiss();
    setLoading(true);
    try {
      const res = await fetch("/api/account/change-email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newEmail: email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string | { message?: string };
        message?: string;
      };
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : (data.error?.message ?? data.message ?? "Failed to send code.");
        toast.error(msg);
        return;
      }
      setStep("otp");
      setResendCooldown(RESEND_COOLDOWN_SEC);
    } catch {
      toast.error("Failed to send code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="rounded-xl"
      >
        Change email
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change email</DialogTitle>
            <DialogDescription>
              {step === "email"
                ? "Enter your new email address. We’ll send a verification code to confirm."
                : "Enter the 6-digit code we sent to your new email."}
            </DialogDescription>
          </DialogHeader>
          <ChangeEmailForm
            currentEmail={currentEmail}
            step={step}
            newEmail={newEmail}
            otp={otp}
            onStepChange={setStep}
            onNewEmailChange={(v) => {
              setNewEmail(v);
              toast.dismiss();
            }}
            onOtpChange={(v) => {
              setOtp(v);
              toast.dismiss();
            }}
            onError={toast.error}
            onSuccess={() => {
              onSuccess();
              handleOpenChange(false);
            }}
            loading={loading}
            setLoading={setLoading}
            resendCooldown={step === "otp" ? resendCooldown : undefined}
            onResend={step === "otp" ? handleSendCode : undefined}
          />
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            {step === "otp" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("email")}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  form={CHANGE_EMAIL_VERIFY_FORM_ID}
                  disabled={loading || otp.trim().length !== OTP_LENGTH}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {loading && (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  )}
                  {loading ? "Updating…" : "Verify & update"}
                </Button>
              </>
            ) : (
              <Button
                type="submit"
                form={CHANGE_EMAIL_SEND_FORM_ID}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {loading && (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                )}
                {loading ? "Sending…" : "Send code"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

function AvatarEditor({
  currentUrl,
  displayLabel,
  onSave,
  size = "lg",
}: {
  currentUrl: string | null;
  displayLabel: string;
  onSave: (url: string) => Promise<{ error?: string }>;
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  /** Local preview so the UI updates immediately; session props can lag behind DB after save. */
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);

  useEffect(() => {
    setPreviewUrl(currentUrl);
  }, [currentUrl]);

  const sizeClass = size === "lg" ? "h-20 w-20 text-2xl" : "h-14 w-14 text-lg";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast.dismiss();
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error("Please use JPEG, PNG, GIF, or WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error("Image must be under 2MB.");
      return;
    }
    setLoading(true);
    try {
      const { url: imageUrl } = await uploadFile(file, 0);
      if (!imageUrl) {
        toast.error("Upload failed");
        return;
      }
      const result = await onSave(imageUrl);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setPreviewUrl(imageUrl);
      router.refresh();
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const handleSaveUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    toast.dismiss();
    setLoading(true);
    try {
      const result = await onSave(url);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setPreviewUrl(url);
      setUrlInput("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex flex-col items-center gap-2">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={previewUrl}
            src={previewUrl}
            alt={displayLabel}
            className={`rounded-full object-cover shrink-0 ${sizeClass}`}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className={`flex items-center justify-center rounded-full bg-bg-muted text-text-muted font-semibold shrink-0 ${sizeClass}`}
          >
            {displayLabel.charAt(0).toUpperCase()}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_AVATAR_TYPES.join(",")}
          className="hidden"
          onChange={handleFileChange}
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="text-xs font-medium text-accent hover:text-accent/80 disabled:opacity-60"
        >
          {loading ? "Uploading..." : "Upload image"}
        </button>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-xs text-text-muted">Or paste image URL</p>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="flex-1 min-w-0 rounded-lg border border-input bg-bg px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
            disabled={loading}
          />
          <button
            type="button"
            onClick={handleSaveUrl}
            disabled={loading || !urlInput.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Save URL
          </button>
        </div>
      </div>
    </div>
  );
}

function getTimezoneLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value;
    if (offsetPart) return `${tz} (${offsetPart})`;
  } catch {
    // ignore invalid timezone
  }
  return tz;
}

function DetectTimezoneButton({
  selectId,
  onDetected,
}: {
  selectId: string;
  /** Keep controlled timezone state in sync when using "Use my location". */
  onDetected?: (tz: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          const tz =
            typeof Intl !== "undefined" &&
            "resolvedOptions" in Intl.DateTimeFormat.prototype
              ? new Intl.DateTimeFormat().resolvedOptions().timeZone
              : "UTC";
          const select = document.getElementById(
            selectId,
          ) as HTMLSelectElement | null;
          if (select && tz) {
            if ([...select.options].some((o) => o.value === tz)) {
              select.value = tz;
            } else {
              const opt = document.createElement("option");
              opt.value = tz;
              opt.textContent = tz;
              select.appendChild(opt);
              select.value = tz;
            }
            onDetected?.(tz);
          }
        } catch {
          // ignore
        }
      }}
      className="rounded-xl border border-border bg-bg px-3 py-2.5 text-sm font-medium text-text hover:bg-muted transition-colors"
    >
      Use my location
    </button>
  );
}

export function SettingsClient({
  displayName,
  email,
  image,
  settings,
  connections,
  timeZones,
  isCredentialUser,
}: {
  displayName: string;
  email: string;
  image: string | null;
  settings: SettingsSnapshot;
  connections: SettingsConnection[];
  timeZones: string[];
  isCredentialUser: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] =
    useState<(typeof SETTINGS_TABS)[number]["id"]>("profile");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changeEmailSuccess, setChangeEmailSuccess] = useState(false);
  const [clientTimezone, setClientTimezone] = useState("");
  /** Controlled so the select updates after save (uncontrolled defaultValue does not). */
  const [timezoneValue, setTimezoneValue] = useState(settings.timezone ?? "UTC");
  const [timezonePending, startTimezoneTransition] = useTransition();

  useEffect(() => {
    setTimezoneValue(settings.timezone ?? "UTC");
  }, [settings.timezone]);

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (typeof tz === "string" && tz.trim()) setClientTimezone(tz.trim());
    } catch {
      // ignore
    }
  }, []);

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
            Settings
          </h1>
          <DocsInfoIcon url={DOCS_SETTINGS_URL} />
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Manage your account, security, and posting preferences.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border mb-8">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-accent text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="w-4 h-4" strokeWidth={1.5} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="pb-12">
        {activeTab === "profile" && (
          <section>
            <div>
              <h2 className="text-lg font-semibold text-text">Profile</h2>
              <p className="mt-2 text-sm text-text-muted">
                {isCredentialUser
                  ? "Your Social0 profile. You can change your display name and avatar below."
                  : "Your Google account profile. You can change your display name and avatar below."}
              </p>
              <div className="mt-4 space-y-6">
                <div>
                  <p className="text-sm font-medium text-text mb-2">
                    Profile picture
                  </p>
                  <AvatarEditor
                    currentUrl={image}
                    displayLabel={displayName || email || "User"}
                    onSave={updateUserImage}
                    size="lg"
                  />
                </div>
                <form action={updateDisplayName} className="space-y-4">
                  <div>
                    <label
                      htmlFor="displayName"
                      className="text-sm font-medium text-text"
                    >
                      Display Name
                    </label>
                    <input
                      id="displayName"
                      name="displayName"
                      defaultValue={displayName}
                      className="mt-1 w-full rounded-xl border border-input bg-bg px-4 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text mb-2">
                      Email Address
                    </p>
                    {isCredentialUser ? (
                      <>
                        <p className="mt-1 text-sm text-text">{email}</p>
                        <p className="mt-1 text-xs text-text-muted">
                          To change your email, use the Security section below.
                        </p>
                      </>
                    ) : (
                      <p
                        className="mt-1 rounded-xl border border-border bg-bg-muted px-4 py-2.5 text-sm text-text-muted select-none cursor-not-allowed"
                        tabIndex={-1}
                        aria-readonly="true"
                      >
                        {email}
                      </p>
                    )}
                  </div>
                  <SaveButton />
                </form>
              </div>
            </div>
            <div className="mt-10">
              <h2 className="text-lg font-semibold text-text">Appearance</h2>
              <p className="mt-2 text-sm text-text-muted">
                Choose light, dark, or follow your system setting.
              </p>
              <div className="mt-4">
                <ThemeToggle />
              </div>
            </div>
            <div className="border-t border-border my-8" />
            <div>
              <h2 className="text-lg font-semibold text-text">Security</h2>
              <p className="mt-1 text-sm text-text-muted">
                Sign out from all active sessions across devices.
              </p>
              {isCredentialUser && (
                <>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <ChangePasswordModal
                      onError={() => {}}
                      onSuccess={() => setPasswordSuccess(true)}
                    />
                    <ChangeEmailModal
                      currentEmail={email}
                      onSuccess={() => setChangeEmailSuccess(true)}
                    />
                  </div>
                  {passwordSuccess && (
                    <p className="mt-2 text-sm text-emerald-600">
                      Password updated successfully.
                    </p>
                  )}
                  {changeEmailSuccess && (
                    <p className="mt-2 text-sm text-emerald-600">
                      Email updated successfully.
                    </p>
                  )}
                </>
              )}
              <form
                action={signOutAllDevices}
                className={isCredentialUser ? "mt-6" : "mt-4"}
              >
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-accent dark:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Sign Out All Devices
                </button>
              </form>
            </div>
          </section>
        )}

        {activeTab === "preferences" && (
          <section>
            <div>
              <h2 className="text-lg font-semibold text-text">
                Platform preferences
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                24-hour time and date format for the app.
              </p>
              <form
                action={updatePlatformPreferences}
                className="mt-4 space-y-4"
              >
                {clientTimezone ? (
                  <input
                    type="hidden"
                    name="clientTimezone"
                    value={clientTimezone}
                  />
                ) : null}
                <Toggle
                  id="use24HourTimeFormat"
                  name="use24HourTimeFormat"
                  defaultChecked={settings.use24HourTimeFormat}
                  label="24-hour time format"
                />
                <div>
                  <label
                    htmlFor="dateFormat"
                    className="block text-sm font-semibold text-text mb-2"
                  >
                    Date format
                  </label>
                  <select
                    id="dateFormat"
                    name="dateFormat"
                    defaultValue={settings.dateFormat}
                    className="w-full rounded-xl border border-input bg-bg px-4 py-2.5 text-sm font-medium text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
                  >
                    {DATE_FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <SaveButton />
              </form>
            </div>
            <div className="border-t border-border my-8" />
            <div>
              <h2 className="text-lg font-semibold text-text">Timezone</h2>
              <p className="mt-1 text-sm text-text-muted">
                Schedules, post times, and calendar are shown in this timezone.
              </p>
              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  startTimezoneTransition(async () => {
                    try {
                      await updateTimezone(fd);
                      const tz =
                        String(fd.get("timezone") ?? "").trim() || "UTC";
                      setTimezoneValue(tz);
                      router.refresh();
                    } catch {
                      toast.error("Failed to save timezone");
                    }
                  });
                }}
              >
                {clientTimezone ? (
                  <input
                    type="hidden"
                    name="clientTimezone"
                    value={clientTimezone}
                  />
                ) : null}
                <div>
                  <label
                    htmlFor="timezone"
                    className="block text-sm font-semibold text-text mb-2"
                  >
                    Your timezone
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      id="timezone"
                      name="timezone"
                      value={timezoneValue}
                      onChange={(e) => setTimezoneValue(e.target.value)}
                      disabled={timezonePending}
                      className="min-w-[320px] rounded-xl border border-input bg-bg px-4 py-2.5 text-sm font-medium text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 disabled:opacity-60"
                    >
                      {timeZones.map((tz) => (
                        <option key={tz} value={tz}>
                          {getTimezoneLabel(tz)}
                        </option>
                      ))}
                    </select>
                    <DetectTimezoneButton
                      selectId="timezone"
                      onDetected={setTimezoneValue}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={timezonePending}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-accent dark:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {timezonePending ? "Saving..." : "Save timezone"}
                </button>
              </form>
            </div>
            <div className="border-t border-border my-8" />
            <div>
              <h2 className="text-lg font-semibold text-text">
                Email preferences
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Notifications and reminders from the app.
              </p>
              <form action={updateAutomationEmails} className="mt-4 space-y-4">
                {clientTimezone ? (
                  <input
                    type="hidden"
                    name="clientTimezone"
                    value={clientTimezone}
                  />
                ) : null}
                <Toggle
                  id="automationEmails"
                  name="automationEmails"
                  defaultChecked={settings.automationEmails}
                  label="Automation Emails"
                  description="Helpful reminders when you haven't posted or connected accounts"
                />
                <SaveButton />
              </form>
            </div>
          </section>
        )}

        {activeTab === "queue" && (
          <section>
            <QueueScheduleSection
              timezone={timezoneValue}
              use24HourTimeFormat={settings.use24HourTimeFormat ?? false}
            />
          </section>
        )}

        {activeTab === "connections" && (
          <section>
            <h2 className="text-lg font-semibold text-text">Connections</h2>
            <p className="mt-2 text-sm text-text-muted mb-4">
              Connected social accounts. Edit an avatar to use a custom profile
              image for that connection.
            </p>
            {connections.length === 0 ? (
              <p className="text-sm text-text-muted">
                No connections yet. Connect accounts from the{" "}
                <Link
                  href="/dashboard/connections"
                  className="font-medium text-accent hover:underline"
                >
                  Connections
                </Link>{" "}
                page.
              </p>
            ) : (
              <ul className="space-y-4">
                {connections.map((conn) => {
                  const platformName =
                    PLATFORMS.find((p) => p.id === conn.platform)?.name ??
                    conn.platform;
                  return (
                    <li
                      key={conn.id}
                      className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-bg p-4"
                    >
                      <AvatarEditor
                        currentUrl={conn.profileImageUrl}
                        displayLabel={
                          conn.platformUsername
                            ? `@${conn.platformUsername}`
                            : platformName
                        }
                        onSave={async (url) =>
                          updateConnectionAvatar(conn.id, url)
                        }
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <PlatformIcon
                            platform={conn.platform}
                            className="h-4 w-4 shrink-0 text-text-muted"
                          />
                          <span className="font-medium text-text">
                            {platformName}
                          </span>
                        </div>
                        {conn.platformUsername && (
                          <p className="text-sm text-text-muted">
                            @{conn.platformUsername}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
