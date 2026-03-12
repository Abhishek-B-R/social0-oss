---
title: Verify Email
description: Verify email with 6-digit code after sign up.
---

# Verify Email

## Route
`/auth/verify-email` — expects `?email=...`

## Purpose
After sign-up, user enters 6-digit verification code sent to their email. Submits via `authClient.emailOtp.verifyEmail`. On success, redirects to `/onboarding`. Resend code with 30s cooldown via `authClient.emailOtp.sendVerificationOtp` (type: "email-verification").

## Access
- Auth required: no (user may not have full session until verified)
- Plan required: none

## Data Flow
### What it fetches
Email from search param. No server fetch on load.

### What it mutates
verifyEmail and sendVerificationOtp via auth-client.

## Components Used
VerifyEmailContent (OTP inputs, verify button, resend), wrapped in Suspense.

## State
email, otp (6 digits), error, loading, resendCooldown (seconds). RESEND_COOLDOWN_SEC = 30.

## Key Business Logic
Same OTP input behavior as reset-password (paste, focus, backspace). Resend disabled while resendCooldown > 0 or loading.

## URL Params / Search Params
- `email` — required. Missing shows "Missing email" and link to /auth.

## Error States
Inline error. Missing email: message + "Sign up again" link.

## Related Pages
- `/auth` — sign up again
- `/onboarding` — after successful verify

## TODO / Known Issues
None.
