# Social0 CLI QA Report

**Date:** 2026-07-14  
**CLI version:** `social0` v0.1.2 (`social0` on PATH)  
**Account:** Abhishek BR (`abhishekbr989@gmail.com`) · plan `growth`  
**Facebook target:** account ID **1** · `facebook` · **Social0** (active) — IDs reorder over time  
**API:** `https://api.social0.app/v1`

> **Retest (v0.1.2):** Prior failures from the first pass were re-checked. See [Retest of prior failures](#retest-of-prior-failures-v012) at the bottom.

---

## Verdict

**Facebook posting works end-to-end.** Live publishes (text, image, markdown, stdin, drafts, multi-platform) all succeeded on the Social0 Facebook page.

The CLI is usable for the happy path, but several UX bugs make follow-up commands (show / edit / schedule / drafts publish) painful — mainly **truncated post IDs** that the API does not accept.

---

## What worked

| Area | Command / scenario | Result |
|------|--------------------|--------|
| Auth status | `social0 whoami` | Shows name, email, plan, masked key, API URL |
| Diagnostics | `social0 doctor` | All checks passed (14 accounts) |
| Version | `social0 version` | `social0 v0.1.0` |
| Examples | `social0 examples` | Prints command examples + sample template |
| Accounts list | `social0 accounts` | Table with numeric IDs 1–14 |
| Output formats | `--json` / `--yaml` / `--table` | Work on accounts (and elsewhere) |
| Config | `social0 config` / `get` / `set` | List, get, set `defaultTimezone` OK |
| Passphrase | `social0 passphrase status` | Reports local file, passphrase disabled |
| Completions | `bash` / `zsh` / `fish` / `powershell` | Scripts generated |
| Post init | `social0 post init` | Sample JSON template |
| Post list | `social0 post list` (+ `--status`) | Lists drafts/published/scheduled |
| **Facebook live publish** | `post create --platform 7 --publish` | **success** — `Published to facebook` |
| **Publish (flags)** | `publish -c "..." -p 7` | **success** |
| **Publish (platform name)** | `--platform facebook` | **success** |
| **Publish (stdin)** | `echo "..." \| social0 publish -p 7` | **success** |
| **Publish (markdown)** | `publish fb-post.md` with `platforms: [facebook]` | **success** |
| **Publish + media** | `publish -p 7 -m <media-uuid>` | **success** |
| **Multi-platform** | `-p 7 2` (Facebook + Bluesky) | **both success** |
| Upload | `social0 upload test.png` | Presign → R2 PUT → confirm; works |
| Upload JSON | `upload --json` | Returns **full** media UUID |
| Schedule (flags) | `schedule -c "..." -p 7 -t "tomorrow 9am"` | API accepts; post created |
| Schedule (markdown) | front matter `schedule: tomorrow 2pm` | Scheduled |
| Schedule (JSON array) | `schedule posts-arr.json` | Both items scheduled |
| Schedule existing draft | `schedule <full-uuid> --time "..."` | Works with **full** UUID |
| Draft create | `post create -c ... -p 7` + blank schedule | Draft created |
| Post show / edit | with **full** UUID | Works |
| Post delete | `post delete <full-uuid>` + confirm `y` | Works (204) |
| Drafts list | `social0 drafts` | Lists drafts |
| Drafts publish | `drafts publish <full-uuid>` | Facebook publish **success** |
| Drafts schedule | `drafts schedule <full-uuid> -t "..."` | Works |
| Drafts delete | `drafts delete <full-uuid>` + `y` | Works |
| Publish latest | `social0 publish latest` | Published newest draft to Facebook |
| Status | `status <tracking-id>` | Shows platform success; `--json` OK |
| Watch | `social0 watch` | Polls; surfaced failed posts |
| Logs | `social0 logs` | Starts event loop (quiet if nothing new) |
| Export | `social0 export file.json` | Exported 100 posts with **full** UUIDs |
| Import | `social0 import file.json` | Creates drafts |
| Accounts connect | `accounts connect facebook` | Prints Facebook OAuth URL |
| Unit tests | `npm test` | 16/17 pass (1 date parser fail — see bugs) |

### Live Facebook posts created during this run (examples)

- Text via `post create --publish`
- Text + image via `publish --media`
- Markdown front-matter publish
- Stdin pipe publish
- Draft → `drafts publish` / `publish latest`
- Multi-platform Facebook + Bluesky
- Platform-name alias `--platform facebook`

---

## What did not work (or is broken)

### Critical / high impact

1. **Truncated post IDs break the main workflow**  
   - Tables, draft list, create success messages, and even `--json` list output show **only 8 chars** (e.g. `76fd5d64`).  
   - Hint text tells you to run `social0 publish 76fd5d64` — that **always fails** (`Post not found` / `Invalid post ID`).  
   - Full UUID is required (e.g. from `export`).  
   - Same pattern for media IDs in table mode (`ff3729d0-889...`); use `upload --json` for the real ID.

2. **Natural language scheduling is wrong for non-UTC machines**  
   - `parseNaturalTime` uses `Date#setHours` (local) then `toISOString()` (UTC) and appends `+default`.  
   - On IST, `tomorrow 9am` becomes `…T03:30:00+default` instead of wall-clock 09:00.  
   - Confirmed by failing unit test: `dates > parses tomorrow`.  
   - Relative phrases **`in 2 hours`**, **`in 2 days at 3pm`** fail with `scheduledAt must be in the future` (not implemented; parser misfires on the number).

3. **`post create` with `-c` / `-p` still prompts for schedule**  
   - Blocks non-interactive / CI use unless you also pass `--publish` or `--schedule`.  
   - Workaround: `printf '\n' | social0 post create ...` or use `--publish` / `--schedule`.

### Medium

4. **`schedule posts.json` with a single object crashes**  
   - Error: `batch is not iterable`.  
   - Must be a **JSON array** of items. Object form should be accepted or rejected with a clear error.

5. **`import` ignores `schedule`**  
   - Only `createPost`; scheduled fields in the import file are dropped. Docs imply richer import than what exists.

6. **`social0 update`**  
   - `Could not check for updates.` (registry/network check failing).

7. **AI commands stubbed**  
   - `suggest` / `improve` / `hashtags` → exit 1: *not yet available on the API*.

8. **`social0 link`**  
   - Fully interactive (checkbox + prompt); no non-interactive flags. Hung in scripted QA until killed.

### Low / polish

9. **`status` prints platform lines twice** in table mode (poll callback + final render).  
10. **Invalid platform** (`--platform myspace`) → generic `Invalid request body` instead of “no matching accounts”.  
11. **TikTok account** listed as `expired` (platform reconnect needed; not a CLI bug).  
12. **`logout` / `passphrase set|remove` / `accounts disconnect`** — not executed (destructive); connect OAuth URL path verified only.

---

## Feature matrix (quick)

| Feature | Status |
|---------|--------|
| login / whoami / doctor | Pass (logout not re-tested) |
| accounts list / connect URL | Pass |
| post create / list / show / edit / delete | Pass (full UUID); short ID fail |
| publish (content, draft, latest, md, stdin, media) | **Pass → Facebook** |
| schedule (flags, md, draft, JSON array) | Pass with timezone caveat; JSON object fail; relative NL fail |
| upload | Pass |
| status / watch / logs | Pass (status double-print) |
| drafts * | Pass with full UUID |
| config / passphrase status / completion / examples / export | Pass |
| import | Pass (drafts only; no schedule) |
| link / update / AI | Fail or incomplete |
| unit tests | 1 failure (dates) |

---

## Recommended fixes (priority)

1. Stop truncating IDs in machine-facing output; resolve short prefixes to UUIDs client-side, **or** print full UUIDs everywhere users must copy.  
2. Fix `parseNaturalTime`: keep local wall-clock components; do not round-trip through `toISOString()` before attaching timezone.  
3. Skip schedule prompt when stdin is not a TTY and `--content`/`--platform` are set (default: draft).  
4. Accept a single JSON object in `schedule <file.json>`, or validate with a clear error.  
5. Wire or hide AI commands until the API exists; fix `update` check.

---

## How to re-verify Facebook quickly

```bash
social0 accounts          # IDs reorder — prefer platform name
social0 publish --content "smoke test" --platform facebook
```

---

## Retest of prior failures (v0.1.2)

Re-ran only items that failed/broke in the first pass against built `social0` v0.1.2.

| Prior issue | Retest result |
|-------------|-------------|
| Truncated post IDs / short ID publish/show | **Fixed** — lists print full UUIDs; create hints use full UUID; short prefix resolves (`post show` / `publish` / `drafts schedule`) |
| Media ID truncated in table | **Fixed** — full UUID in table |
| Schedule wall-clock / timezone (`toISOString`) | **Fixed** — CLI sends `…T09:00:00+default`; API UTC matches IST wall clock; unit tests **19/19** |
| Relative NL (`in 2 hours`, `in 2 days at 3pm`) | **Fixed** — schedules successfully |
| `post create -c -p` hung on schedule prompt | **Fixed** — creates draft with no prompt |
| `schedule` single JSON object (`batch is not iterable`) | **Fixed** |
| `import` ignored `schedule` | **Fixed** — creates scheduled post |
| `social0 update` hard fail | **Improved** — handles unpublished package (`not published on npm yet`) |
| AI suggest/improve/hashtags | **Still unavailable** (API missing) — now hidden from `--help`, clearer message, exit 1 |
| `link` interactive-only hang | **Fixed** — `link --platform 1 --format json` works non-interactively |
| Invalid platform unclear error | **Fixed** — `No matching accounts for: myspace…` |
| `status` double-printed platforms | **Fixed** — one line per platform |

**Still not live product features:** AI endpoints (intentionally stubbed/hidden until API exists).
