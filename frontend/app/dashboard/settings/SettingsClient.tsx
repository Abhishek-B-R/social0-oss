"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  signOutAllDevices,
  updateAutomationEmails,
  updateDisplayName,
  updatePlatformPreferences,
  updateUserImage,
  updateConnectionAvatar,
  type SettingsSnapshot,
} from "@/app/actions/settings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarCollapsibleCard } from "@/app/dashboard/create/SidebarCollapsibleCard";
import { PLATFORMS } from "@/lib/platforms";
import { DATE_FORMAT_OPTIONS } from "@/lib/date-format";
import { uploadFile } from "@/lib/upload-file";
import { PlatformIcon } from "@/components/PlatformIcon";

export type SettingsConnection = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
};

function SaveButton({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 dark:bg-accent dark:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
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
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");

  const sizeClass = size === "lg" ? "h-20 w-20 text-2xl" : "h-14 w-14 text-lg";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setError("Please use JPEG, PNG, GIF, or WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setError("Image must be under 2MB.");
      return;
    }
    setLoading(true);
    try {
      const { url: imageUrl } = await uploadFile(file, 0);
      if (!imageUrl) {
        setError("Upload failed");
        return;
      }
      const result = await onSave(imageUrl);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const handleSaveUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setError(null);
    setLoading(true);
    try {
      const result = await onSave(url);
      if (result.error) {
        setError(result.error);
        return;
      }
      setUrlInput("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex flex-col items-center gap-2">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
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
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}

export function SettingsClient({
  displayName,
  email,
  image,
  settings,
  connections,
}: {
  displayName: string;
  email: string;
  image: string | null;
  settings: SettingsSnapshot;
  connections: SettingsConnection[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-text">Settings</h1>
        <p className="mt-2 text-text-muted">
          Manage your account, security, and posting preferences.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">Appearance</h2>
        <p className="mt-2 text-sm text-text-muted">
          Choose light, dark, or follow your system setting.
        </p>
        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">Profile</h2>
        <p className="mt-2 text-sm text-text-muted">
          Your Google account profile. You can change your display name and
          avatar below.
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
              <p className="text-sm font-medium text-text">Email Address</p>
              <p className="mt-1 rounded-xl border border-border bg-bg-muted px-4 py-2.5 text-sm text-text-muted">
                {email}
              </p>
            </div>
            <SaveButton />
          </form>
        </div>
      </section>

      <SidebarCollapsibleCard
        title="Connections settings"
        defaultCollapsed={true}
      >
        <p className="text-sm text-text-muted mb-4">
          Connected social accounts. Edit an avatar to use a custom profile
          image for that connection.
        </p>
        {connections.length === 0 ? (
          <p className="text-sm text-text-muted">
            No connections yet. Connect accounts from the{" "}
            <a
              href="/dashboard/connections"
              className="font-medium text-accent hover:underline"
            >
              Connections
            </a>{" "}
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
                    onSave={async (url) => updateConnectionAvatar(conn.id, url)}
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
      </SidebarCollapsibleCard>

      {/* <section className="rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">Account</h2>
        <p className="mt-2 text-sm text-text-muted">
          Account managed via Google. Sign-in and security are handled by your
          Google account.
        </p>
        <div className="mt-4">
          <p className="text-sm font-medium text-text">Email</p>
          <p className="mt-1 rounded-xl border border-border bg-bg-muted px-4 py-2.5 text-sm text-text-muted">
            {email}
          </p>
        </div>
      </section> */}

      <section className="rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">Security</h2>
        <p className="mt-2 text-sm text-text-muted">
          Sign out from all active sessions across devices.
        </p>
        <form action={signOutAllDevices} className="mt-4">
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 dark:bg-accent dark:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            Sign Out All Devices
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">Email Preferences</h2>
        <form action={updateAutomationEmails} className="mt-4 space-y-4">
          <Toggle
            id="automationEmails"
            name="automationEmails"
            defaultChecked={settings.automationEmails}
            label="Automation Emails"
            description="Helpful reminders when you haven't posted or connected accounts"
          />
          <SaveButton />
        </form>
      </section>

      <section className="rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">
          Platform Preferences
        </h2>
        <form action={updatePlatformPreferences} className="mt-4 space-y-4">
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
              className="w-full rounded-xl border border-input bg-bg px-4 py-2.5 text-sm font-medium text-text shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
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
      </section>
    </div>
  );
}
