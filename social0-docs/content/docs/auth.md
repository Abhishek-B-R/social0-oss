---
title: Auth (Sign in / Sign up)
description: Sign in and sign up page for email and Google.
---

# Auth (Sign in / Sign up)

## Route
`/auth` — sign in and sign up

## Purpose
Single page for email+password and Google sign-in/sign-up. Supports mode toggle (signin/signup), Turnstile for sign-up when configured, and shows reset-success message when arriving with `?reset=success`. After successful auth, redirects to `/dashboard/composer`.

## Access
- Auth required: no
- Plan required: none
- Who sees this: unauthenticated users (and anyone who navigates here)

## Data Flow
### What it fetches
- No server data on load. Uses `useSearchParams()` for `reset=success` and client-side `signIn` from `@/lib/auth-client`.

### What it mutates
- **Sign in (email):** `signIn.email({ email, password, callbackURL })` — redirects or sets error.
- **Sign in (Google):** `signIn.social({ provider: "google", callbackURL })` — redirects to OAuth.
- **Sign up:** POST to `/api/auth/sign-up-with-turnstile` or `/api/auth/sign-up` with name, email, password, and optionally turnstileToken. On success: redirect to response url or to `/auth/verify-email?email=...` if no url in response.

## Components Used
- Auth page is one client component (AuthPageContent) with form sections, Turnstile widget when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, and links to forgot password and landing.

## State
- mode: "signin" | "signup"
- resetSuccess: boolean (from ?reset=success)
- email, password, name
- turnstileToken (string | null)
- error, loading

## Key Business Logic
- CALLBACK_URL = "/dashboard/composer". Sign-up requires Turnstile when TURNSTILE_SITE_KEY is set; error "Please complete the verification" if missing.
- After sign-up success, redirect to verify-email when API doesn’t return a redirect url.

## URL Params / Search Params
- `reset` — "success" shows success message (e.g. after password reset).

## Error States
- Sign-in/sign-up errors shown inline. API errors parsed from JSON (data.error or data.message).

## Related Pages
- `/` — landing; header link
- `/auth/forgot-password` — request password reset
- `/auth/verify-email` — after sign up
- `/dashboard/composer` — after sign in

## TODO / Known Issues
None in page file.
