---
title: Reset Password
description: Enter OTP and new password to reset.
---

# Reset Password

## Route
`/auth/reset-password` — expects `?email=...`

## Purpose
User enters the 6-digit OTP from email and new password (with confirm). Submits via `authClient.emailOtp.resetPassword`. On success, redirects to `/auth?reset=success`.

## Access
- Auth required: no
- Plan required: none

## Data Flow
### What it fetches
Email from search param `email` (decoded). No API fetch on load.

### What it mutates
Calls `authClient.emailOtp.resetPassword({ email, otp, password })`.

## Components Used
ResetPasswordContent (form with 6 OTP inputs, new password, confirm), wrapped in Suspense with ResetPasswordFallback.

## State
email (from URL), otp (array of 6 digits), password, confirmPassword, error, loading. setOtpFromString for paste handling.

## Key Business Logic
OTP_LENGTH = 6. Validation: otp length 6, password min 8, password === confirmPassword. Paste into OTP inputs fills digits and focuses. Backspace in empty OTP focuses previous input.

## URL Params / Search Params
- `email` — required; pre-filled and sent to API. If missing, shows "Missing email" and link to forgot-password.

## Error States
Inline error (e.g. "Invalid or expired code. Try again."). Missing email: message + link to request reset.

## Related Pages
- `/auth/forgot-password` — get reset code
- `/auth` — success redirect

## TODO / Known Issues
None.
