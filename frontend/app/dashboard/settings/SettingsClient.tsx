"use client";

import { useFormStatus } from "react-dom";
import {
  signOutAllDevices,
  updateAutomationEmails,
  updateDisplayName,
  updatePlatformPreferences,
  type SettingsSnapshot,
} from "@/app/actions/settings";
import { ThemeToggle } from "@/components/ThemeToggle";

function SaveButton({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
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

export function SettingsClient({
  displayName,
  email,
  settings,
}: {
  displayName: string;
  email: string;
  settings: SettingsSnapshot;
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
        <form action={updateDisplayName} className="mt-4 space-y-4">
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
      </section>

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
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
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
          <SaveButton />
        </form>
      </section>
    </div>
  );
}
