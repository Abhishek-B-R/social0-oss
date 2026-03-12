---
title: Settings
description: User profile, preferences, queue, and connections.
---

# Settings

## Route
`/dashboard/settings` — user profile, preferences, queue schedule, and connections

## Purpose
Single settings screen with tabs: Profile (display name, avatar, theme), Preferences (automation emails, date/time format, timezone), Queue (schedule/windows for queue), and Connections (list of connected accounts with avatar override). Credential (email/password) users see password visibility toggle; OAuth-only users do not. Saves are done via server actions with revalidatePath.

## Access
- Auth required: yes
- Plan required: any
- Who sees this: all authenticated users

## Data Flow
### What it fetches
- **Session** — `auth.api.getSession({ headers })`; no session → `redirect("/")`.
- **User settings** — `getUserSettingsSnapshot()` from `@/app/actions/settings`: automationEmails, use24HourTimeFormat, dateFormat, timezone.
- **Connections** — `db.query.connectedAccounts.findMany` where userId and isActive = true; id, platform, platformUsername, profileImageUrl, isTwitterPremium.
- **Credential account** — `db.query.account.findFirst` where userId and providerId = "credential"; used to set isCredentialUser (show password field or not).
- **Time zones** — Intl.supportedValuesOf("timeZone") when available, else fallback list (UTC, America/New_York, etc.).

### What it mutates
- **updateDisplayName** — form "displayName" → user.name.
- **updateUserImage** — image URL → user.image (and updateConnectionAvatar for per-connection avatar).
- **updateAutomationEmails** — form "automationEmails" checkbox → userSettings.automationEmails.
- **updatePlatformPreferences** — use24HourTimeFormat, dateFormat → userSettings.
- **updateTimezone** — form timezone → userSettings.timezone.
- **signOutAllDevices** — revokes sessions and redirects to "/".
All via `@/app/actions/settings`; revalidatePath("/dashboard/settings"). Avatar upload uses `uploadFile` from `@/lib/upload-file` then passes URL to updateUserImage/updateConnectionAvatar.

## Components Used
- **SettingsClient** — Client component with tabs: Profile, Preferences, Queue, Connections. Uses ThemeToggle, PLATFORMS, DATE_FORMAT_OPTIONS, PlatformIcon, QueueScheduleSection, Dialog (password/confirm), Input, Label, Button. Calls settings actions and uploadFile for avatars.

## State
- **SettingsClient:** Tab selection, form defaults from server, pending state via useFormStatus, dialog open state for password/sign-out. QueueScheduleSection and connection avatar state live in client.

## Key Business Logic
- **isCredentialUser:** When true, profile section shows password field and sign-out-all-devices; otherwise only display name and avatar.
- **Queue tab:** QueueScheduleSection manages queue schedule (slots/windows); behavior depends on plan and API — needs investigation for full detail.
- **Connections:** List with optional avatar override per connection (updateConnectionAvatar).

## URL Params / Search Params
None.

## Error States
- updateUserImage / updateConnectionAvatar return { error } on failure; SettingsClient can show error. signOutAllDevices redirects to "/". No global error boundary documented.

## Related Pages
- `/dashboard/connections` — dedicated connections management (this tab is a subset view)
- `/` — after sign out all devices

## TODO / Known Issues
SettingsClient is large (~1000+ lines); QueueScheduleSection and connection avatar flow may have additional logic not summarized here.
