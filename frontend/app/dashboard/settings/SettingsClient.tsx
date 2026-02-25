"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  signOutAllDevices,
  updateAutomationEmails,
  updateDisplayName,
  updatePlatformPreferences,
  updateWeeklyPostingGoal,
  type SettingsSnapshot,
} from "@/app/actions/settings";

function SaveButton({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function SecondaryButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
    >
      {label}
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
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      </div>
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
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
        <h1 className="text-2xl font-extrabold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-500">Manage your account, security, and posting preferences.</p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
        <form action={updateDisplayName} className="mt-4 space-y-4">
          <div>
            <label htmlFor="displayName" className="text-sm font-medium text-gray-700">
              Display Name
            </label>
            <input
              id="displayName"
              name="displayName"
              defaultValue={displayName}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Email Address</p>
            <p className="mt-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
              {email}
            </p>
          </div>
          <SaveButton />
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Email Address</h2>
        <p className="mt-2 text-sm text-gray-500">Current email: {email}</p>
        <div className="mt-4">
          <SecondaryButton label="Change Email Address" />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Password</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <SecondaryButton label="Change Password" />
          <Link href="#" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
            Forgot Password? Send Reset Link
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Security</h2>
        <p className="mt-2 text-sm text-gray-500">Sign out from all active sessions across devices.</p>
        <form action={signOutAllDevices} className="mt-4">
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            Sign Out All Devices
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Email Preferences</h2>
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

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Platform Preferences</h2>
        <form action={updatePlatformPreferences} className="mt-4 space-y-4">
          <Toggle
            id="useFilenameAsCaption"
            name="useFilenameAsCaption"
            defaultChecked={settings.useFilenameAsCaption}
            label="Use file name as caption"
          />
          <Toggle
            id="use24HourTimeFormat"
            name="use24HourTimeFormat"
            defaultChecked={settings.use24HourTimeFormat}
            label="24-hour time format"
          />
          <SaveButton />
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Weekly Posting Goal</h2>
        <form action={updateWeeklyPostingGoal} className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="weeklyPostingGoal" className="text-sm font-medium text-gray-700">
              Posts per week
            </label>
            <input
              id="weeklyPostingGoal"
              name="weeklyPostingGoal"
              type="number"
              min={0}
              max={100}
              defaultValue={settings.weeklyPostingGoal}
              className="mt-1 w-40 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <SaveButton />
        </form>
      </section>
    </div>
  );
}
