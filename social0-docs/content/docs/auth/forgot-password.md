---
title: Forgot Password
description: Request a password reset code by email.
---

# Forgot Password

## Route
`/auth/forgot-password`

## Purpose
User enters email; app sends a password-reset OTP via `authClient.emailOtp.requestPasswordReset`. On success, redirects to `/auth/reset-password?email=...` to enter the code and new password.

## Access
- Auth required: no
- Plan required: none

## Data Flow
### What it fetches
None.

### What it mutates
Calls `authClient.emailOtp.requestPasswordReset({ email })`; no direct DB writes in this page.

## Components Used
Single-page form (email input, submit, link back to /auth).

## State
email, error, loading.

## Key Business Logic
Email normalized to trim and lowercase. Empty email shows "Enter your email address."

## URL Params / Search Params
None.

## Error States
Inline error from API or generic "Something went wrong. Try again."

## Related Pages
- `/auth` — Back to sign in
- `/auth/reset-password` — Next step (with email in query)

## TODO / Known Issues
None.
