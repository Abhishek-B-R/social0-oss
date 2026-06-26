# Social0 Docs

Standalone Fumadocs site for Social0 documentation. Styled to match the Social0 design system (accent `#1A6B4A`, Instrument Serif headings, Geist Sans body, no shadows).

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Home links to **Browse docs** → `/docs`.

## Build

```bash
npm run build
npm start
```

## Structure

- **Navbar** - "Social0 | Docs" (custom component in `components/docs-navbar.tsx`). Links to social0.app, Dashboard, and X.
- **Content** - `content/docs/` (MDX). Structure:
  - `index.mdx` - Overview
  - `getting-started/` - Getting started, Connecting accounts
  - `platforms/` - Twitter, Instagram, LinkedIn, TikTok, Bluesky, Facebook, Threads, Pinterest, YouTube
  - `post-types/` - Text, Image, Video, Thread, Collection
  - `features/` - Scheduling, Queue, Bulk tools, Auto-repost
  - `billing/` - Plans, FAQ
  - `developer/` - Architecture, Pages reference (agent-generated page docs go under `developer/pages/`)

## Doc agent

Write all documentation as **.mdx** files compatible with Fumadocs (frontmatter `title`, `description`). Output to `content/docs/` following the structure above. Per-page app documentation from the agent goes in `content/docs/developer/pages/` (e.g. `posts.mdx`, `composer.mdx`).

## Deploy

Deploy separately to Vercel (e.g. `docs.social0.app`). Build command: `npm run build`. Output: default Next.js.
