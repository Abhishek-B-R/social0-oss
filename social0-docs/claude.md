# Social0 Docs - AI / Claude Guidance

This document describes the **social0-docs** project: a standalone Fumadocs site for Social0 documentation. It summarizes what was built, how it’s structured, and constraints to keep edits consistent.

---

## 1. What this project is

- **Standalone Next.js app** in **`social0-docs/`** (not inside the main frontend). It is the single source of truth for product docs.
- **Fumadocs** (fumadocs-ui, fumadocs-core, fumadocs-mdx) powers the docs layout, sidebar, MDX rendering, and search.
- **Design** matches the main Social0 site: same fonts (Geist + Instrument Serif), colors (green accent `#1a6b4a`), no shadows (border-only), light/dark themes.

---

## 2. Tech stack

- **Framework:** Next.js 16 (App Router).
- **Docs:** Fumadocs MDX (`fumadocs-mdx`, `fumadocs-ui`, `fumadocs-core`).
- **Styling:** Tailwind CSS v4; Fumadocs preset + neutral CSS; overrides in `app/globals.css` for Social0 tokens.
- **Fonts:** Geist (sans/mono via `geist`), Instrument Serif (headings) via `next/font/google`.
- **Theme:** `next-themes` (used by Fumadocs `RootProvider`); class-based light/dark on `<html>`.
- **Icons:** `@tabler/icons-react` (navbar, theme toggle).

---

## 3. Directory layout

- **`app/`** - App Router.
  - **`app/layout.tsx`** - Root layout: fonts, `RootProvider`, `DocsNavbar`, favicon metadata, `globals.css`.
  - **`app/page.tsx`** - Home/landing (e.g. redirect or simple welcome).
  - **`app/docs/`** - Docs section.
    - **`app/docs/layout.tsx`** - Uses `DocsLayout` from fumadocs-ui; `tree={source.pageTree}`, sidebar options, `baseOptions()` (nav disabled).
    - **`app/docs/[[...slug]]/page.tsx`** - Catch-all for doc pages; renders Fumadocs page + TOC etc.
  - **`app/api/search/route.ts`** - Search API used by Fumadocs search.
  - **`app/globals.css`** - Tailwind imports, Social0 CSS variables (light/dark), Fumadocs overrides (`--color-fd-*`), no-shadow rules for sidebar/nav.
- **`components/`** - React components.
  - **`docs-navbar.tsx`** - Sticky top navbar: left “Social0 | Docs”, right ThemeToggle + Dashboard link + X icon.
  - **`theme-toggle.tsx`** - Client component: sun/moon horizontal toggle with sliding thumb; uses `next-themes` `useTheme()`.
  - **`mdx.tsx`** - Optional MDX component overrides (e.g. custom headings, code blocks).
- **`content/docs/`** - All documentation source. Structure here becomes the sidebar tree. Supports `.md` and `.mdx`; **frontmatter is required** (see §5).
- **`lib/`** - Docs wiring.
  - **`lib/source.ts`** - Loads Fumadocs source (page tree, etc.) from `source.config.ts`.
  - **`lib/layout.shared.tsx`** - `baseOptions()` for `DocsLayout` (e.g. `nav.enabled: false` because we use a custom navbar).
- **`public/`** - Static assets. **`favicon-light.png`** is the favicon (from main app’s `logo-circular.png`); referenced in root layout metadata.
- **`source.config.ts`** - Fumadocs MDX config; points `dir` to `content/docs`.

---

## 4. Design system (Social0 alignment)

- **CSS variables** in `app/globals.css`:
  - **Light:** `--background: #fafaf8`, `--foreground: #0a0a0a`, `--accent: #1a6b4a`, `--border: #e2ded6`, `--muted`, `--card`, etc.
  - **Dark:** `.dark` overrides for dark backgrounds and borders.
  - **Fumadocs:** `--color-fd-primary`, `--color-fd-accent`, etc. set so Fumadocs UI uses the same green and neutrals.
- **Fonts:** Body/sans/mono = Geist; headings = Instrument Serif (`--font-serif`).
- **No shadows:** Sidebar and nav use borders only (`box-shadow: none`; border color from `--border`). Avoid adding `shadow-*` for doc UI.

---

## 5. Documentation content policy (user-facing product docs)

All docs in **`content/docs/`** are **user-facing product documentation**. They are for people who signed up for Social0 and want to use it-not for developers or internal technical readers.

**Audience:** A regular person who uses Social0 to schedule and publish posts. They don’t need to know what an API or database is. They care about what to click, what they see, and how to get things done.

**Rules when writing or editing docs:**

- **NEVER mention:** Code, functions, components, or file names; API routes, endpoints, database, or server actions; Next.js, React, Drizzle, BullMQ, or any tech stack; internal architecture or how things work under the hood; error codes or technical error messages.
- **ALWAYS:** Write in plain English; focus on what the user clicks, sees, and does; use short sentences; use “you” and talk directly to the user; explain what each feature does and how to use it step by step.

**Standard page format:** Each doc page should have:

- **Frontmatter:** `title`, `description` (one sentence: what this page helps you do).
- **Overview** - One short paragraph: what this is and why it exists.
- **How to [main action]** - Numbered steps (1. Go to… 2. Click… 3. Fill in…).
- **Other sections as needed** - Short, plain language.
- **Tips** - 2–3 bullet points of useful things to know.
- **Common questions** - Q&A in simple user questions and answers.

**Tone:** Friendly, clear, direct-like a helpful teammate explaining the product. Not a lawyer. Not an engineer.

**Sections covered:** index (welcome), getting-started, platforms/_, post-types/_, features/_, billing/_, dashboard/\* (composer, create, connections, posts, settings, queue, feedback, bulk-tools, etc.), onboarding, auth (sign in, verify email, forgot/reset password), privacy, terms. The **developer/** section is intentionally non-technical: “Integrations and API” points users to contact for API/integrations; no internal architecture or code.

**Free tier:** Document that on the free tier users can **only explore the dashboard**-they **cannot connect accounts or post anything** (no drafts, no scheduling, no publishing). Connecting accounts and posting require a paid plan (Starter, Growth, or Pro).

---

## 6. Content and frontmatter

- **Location:** All docs live under **`content/docs/`**. Folder structure = sidebar tree.
- **Formats:** `.md` and `.mdx`.
- **Frontmatter (required):** Every doc must have valid frontmatter. Fumadocs MDX expects at least:
  - **`title`** (string) - Used in sidebar and meta.
  - **`description`** (string) - Used for meta and search.
- **Invalid frontmatter** (e.g. missing `title` or `description`) causes the build to fail with “invalid frontmatter … title: expected string, received undefined”. When adding or moving docs, always add or fix frontmatter.

---

## 7. Navbar and theme toggle

- **Navbar** (`components/docs-navbar.tsx`): Custom top bar; Fumadocs nav is disabled in `baseOptions()` so we don’t get a duplicate nav.
  - Left: “Social0” (link to social0.app) + “|” + “Docs”.
  - Right: **Theme toggle** (sun/moon, sliding thumb) → Dashboard (external) → X (Twitter) link.
- **Theme toggle** (`components/theme-toggle.tsx`): Client component; uses `useTheme()` from `next-themes`. Sun = light, moon = dark; active icon sits in the sliding thumb. Placed at the **top** of the page (navbar), not in footer or sidebar.

---

## 8. Favicon

- **Single favicon:** The docs use only the **light** circular logo (Social0 feather + “Social0” on light gray).
- **Assets:** `public/favicon-light.png` is a copy of the main app’s `frontend/public/logo-circular.png`.
- **Metadata:** In `app/layout.tsx`, `metadata.icons` sets `icon` and `apple` to `'/favicon-light.png'` (no dark variant; one favicon for all themes).

---

## 9. What was done (summary)

1. **Standalone Fumadocs site** in `social0-docs/`: Next.js 16, Fumadocs MDX, Tailwind, Geist + Instrument Serif.
2. **Design system:** Social0 CSS variables and Fumadocs overrides in `globals.css`; no shadows; green accent.
3. **Custom navbar:** `DocsNavbar` with Social0 | Docs, theme toggle, Dashboard, X; Fumadocs nav disabled.
4. **Docs layout:** `DocsLayout` with sidebar, shared options from `lib/layout.shared.tsx`, source from `lib/source.ts` and `source.config.ts`.
5. **Content migration:** All files from the project root **`docs/`** were moved into **`social0-docs/content/docs/`** (structure preserved); then the root **`docs/`** folder was removed.
6. **Frontmatter fixes:** Every `.md`/`.mdx` under `content/docs/` was given valid `title` and `description` so the Fumadocs build succeeds.
7. **Theme toggle:** Added at the **top** of the docs (navbar): sun/moon toggle with sliding thumb, implemented in `theme-toggle.tsx` using `next-themes`.
8. **Favicon:** Set to the circular Social0 logo only (`favicon-light.png` from `logo-circular.png`); configured in root layout metadata.
9. **Docs rewritten as user-facing product docs:** Every file in `content/docs/` was rewritten to the content policy above: plain English, “you” voice, no code/API/tech, standard format (Overview, How to, Tips, Common questions). Developer section is non-technical (Integrations and API, contact for custom needs).

---

## 10. Build and config notes

- **Next config:** `next.config.mjs` uses `createMDX()` from `fumadocs-mdx/next` and exports `withMDX(config)`. Do not pass the full Next config into `createMDX()` - use the pattern: `const withMDX = createMDX(); export default withMDX(config);`.
- **Provider:** Use `RootProvider` from **`fumadocs-ui/provider/next`** (not `fumadocs-ui/provider`). It wraps the app with theme and search providers.
- **Sidebar:** Sidebar configuration (e.g. `defaultOpenLevel`, `banner`) lives in `app/docs/layout.tsx` and is passed as the `sidebar` prop to `DocsLayout`; `BaseLayoutProps` in Fumadocs types include `sidebar` on the layout, not only in shared options.

---

## 11. Constraints for edits

- **Do not** re-enable Fumadocs’ built-in nav without removing or reworking the custom `DocsNavbar` to avoid duplicate navs.
- **Do not** add new docs under `content/docs/` without valid **`title`** and **`description`** in frontmatter.
- **Do not** introduce technical or developer content into product docs: no code, APIs, endpoints, database, or internal architecture. Keep the audience (regular users) and tone (friendly, plain English) per §5.
- **Keep** styling aligned with Social0: use CSS variables from `globals.css`; avoid shadows; use the same green accent for links and interactive elements.
- **Favicon:** Single logo only; if you need a dark favicon later, add it in metadata with `prefers-color-scheme` and ensure assets exist in `public/`.
