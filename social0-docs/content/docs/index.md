---
title: Landing Page
description: Public marketing page for Social0.
---

# Landing Page

## Route
`/` — root URL

## Purpose
Public marketing page for Social0. Explains the product (one composer, multiple platforms, no copy-paste), builds trust with features and pricing, and drives sign-up. Users can navigate to features, platforms, pricing, FAQ, and CTA. Authenticated users see a dashboard link instead of "Get started".

## Access
- Auth required: no
- Plan required: none
- Who sees this: everyone (anonymous and logged-in)

## Data Flow
### What it fetches
None. The page is static; no DB or API calls on load. Session is read client-side in `LandingHeader` via `useSession()` from `@/lib/auth-client` only to toggle header CTA (Get started vs dashboard link).

### What it mutates
Nothing. Theme preference is stored in `localStorage` by the header (dark/light toggle).

## Components Used
- **LandingHeader** — Sticky header with logo, nav links (#features, #platforms, #pricing, #faq), theme toggle, and CTA (Get started or dashboard link with user avatar). Uses `useSession()` for auth state; mobile menu with same links and CTA.
- **Hero** — Headline "Write once. Publish everywhere.", subtitle, "Start for free" CTA, "No credit card required", and a mini composer mockup (dark/light inverted by theme).
- **PlatformStrip** — Visual strip of supported platforms (from Hero target platforms: Twitter, Bluesky, LinkedIn, Threads).
- **DashboardMockup** — Marketing section showing dashboard preview.
- **WhoIsItFor** — Target-audience section.
- **HowItWorks** — Process/flow section.
- **FeaturesSection** — Product features.
- **SupportedPlatforms** — List/section of supported platforms.
- **FounderSection** — Founder story / trust.
- **PricingSection** — Pricing plans and CTAs.
- **FAQ** — Frequently asked questions.
- **FinalCTA** — Final call-to-action.
- **LandingFooter** — Footer with links and branding.

## State
- **LandingHeader (client):** `mobileMenuOpen` (boolean), `darkMode` (boolean). Theme is read from `localStorage` and `prefers-color-scheme` on mount.

## Key Business Logic
- Header shows "Get started" → `/auth` when not logged in; shows user avatar + "Account" linking to `/dashboard` when logged in.
- Dark mode: `document.documentElement.classList.add("dark")` and `localStorage.setItem("theme", "dark")` (or light); initial state from saved theme or system preference.

## URL Params / Search Params
None.

## Error States
No explicit error UI. If session fetch fails, header falls back to unauthenticated state.

## Related Pages
- `/auth` — sign in / sign up (Get started)
- `/dashboard` — main app (redirects to `/dashboard/composer`)
- In-page anchors: #features, #platforms, #pricing, #faq

## TODO / Known Issues
None found in page or main landing components.
