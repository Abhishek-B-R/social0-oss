# X DM inbox → X Chat API (design note)

Status: proposal, no code. Written 2026-11-03.

## Why

The inbox reads X DMs through the legacy v2 DM endpoints with the account's
OAuth 1.0a token:

- list: `GET /2/dm_events` (`fetchTwitterList`, `backend/server/src/lib/inbox/fetch-dms.ts`, capped at `X_DM_LIST_PAGE_CAP = 2` pages over the 90-day `dmListFetchPlan` lookback)
- thread: `GET /2/dm_conversations/:id/dm_events` (`fetchTwitterThread`, one page of `DM_THREAD_PAGE_SIZE = 50`)
- reply: `POST /2/dm_conversations/:id/messages` or `/with/:peerId/messages` (`replyTwitter`, `lib/inbox/reply-dm.ts`)

On the owner's account (@abhitwt) every recent conversation has moved to X's
end-to-end encrypted chat, and the legacy API returns nothing newer than
2026-11-01. The inbox now shows stale X DMs only. X documents a separate X Chat
API with client-side encryption through the Chat XDK.

Sources read on 2026-11-03 (all cited below by short name):

| Short name | URL |
| --- | --- |
| intro | https://docs.x.com/xchat/introduction |
| getting-started | https://docs.x.com/xchat/getting-started |
| xdk | https://docs.x.com/xchat/xchat-xdk |
| keys | https://docs.x.com/xchat/handling-private-keys |
| realtime | https://docs.x.com/xchat/real-time-events |
| troubleshooting | https://docs.x.com/xchat/troubleshooting |
| media | https://docs.x.com/xchat/media |
| ref:list | https://docs.x.com/x-api/chat/get-chat-conversations |
| ref:events | https://docs.x.com/x-api/chat/get-chat-conversation-events |
| ref:send | https://docs.x.com/x-api/chat/send-chat-message |
| ref:keys-get / ref:keys-add | https://docs.x.com/x-api/chat/get-user-public-keys, https://docs.x.com/x-api/chat/add-public-key |
| rate-limits | https://docs.x.com/x-api/fundamentals/rate-limits |
| pricing | https://docs.x.com/x-api/getting-started/pricing |
| changelog | https://docs.x.com/changelog |

Not read: the reference pages for conversation keys, groups, get-one-conversation,
mark-read, typing, chat media upload/download schemas, and the
"building UI apps with WASM" and cryptography primer guides. Read those before
implementation starts.

---

## 1. Endpoints and auth

Base `https://api.x.com/2`.

| Need | Endpoint | Notes |
| --- | --- | --- |
| List conversations | `GET /chat/conversations` | `max_results` 1-1000 (default 200), `pagination_token` from `meta.next_token` (same filters or 400), `unread_only`, `type`, `start_time`/`end_time` (on latest message time), `expansions=participant_ids`, `user.fields`. Newest first. A page can be short or empty while `has_more` is true. (ref:list) |
| Read a conversation | `GET /chat/conversations/{id}/events` | `max_results` 1-100 (default 10), `pagination_token`. Newest first; mixes messages, key changes, group changes, read receipts. `meta.conversation_key_events` carries key material for history. Only `id` and `encoded_event` are always present. (ref:events, troubleshooting) |
| Send | `POST /chat/conversations/{id}/messages` | Body: SDK-generated `message_id` plus either `encoded_message_create_event` + `encoded_message_event_signature` (encrypted) or plaintext `content`. Pick by the recipient's `receives_your_chat` user field: encrypted, unencrypted, or none (cannot be messaged → 403 `recipient-not-messageable`). For 1:1 the path id can be the recipient's user id. Retries must resend the same encrypted payload. (ref:send, troubleshooting) |
| Public keys | `GET` / `POST /users/{id}/public_keys` | GET returns `public_key`, `public_key_version`, `signing_public_key`, `juicebox_config`. (ref:keys-get, ref:keys-add) |
| Conversation keys | `POST /chat/conversations/{id}/keys` | Only needed to start or rotate an encrypted conversation. (getting-started) |
| Media | `/chat/media/upload/{initialize,{id}/append,{id}/finalize}`, `GET /chat/media/{conversation_id}/{media_hash_key}` | Download is ciphertext; decrypt with `decryptStream`. Needs `media.write`. (media) |
| Real time | Activity API `chat.received` / `chat.sent` / `chat.conversation_join` via `/2/activity/stream`, subscriptions or webhooks | Payload carries `encoded_event` ciphertext plus `conversation_id`, `sender_id`, `conversation_key_version`. (realtime) |

Events are encrypted only when they carry `conversation_key_version`; events
without it, "such as messages sent before the conversation was encrypted", are
plaintext but still Thrift-encoded inside `encoded_event`, so even they need the
XDK to decode (ref:events). The XDK does not make HTTP calls: you pair it with
the XDK API client or plain HTTPS (xdk).

**Auth.** "OAuth 2.0 user context with DM-related scopes (dm.read, dm.write,
plus users.read / tweet.read as required; media.write for uploads)" (intro).
Every chat endpoint in the reference lists only OAuth 2.0 user-token security.
Per endpoint: list = `dm.read users.read`; events = `dm.read tweet.read
users.read`; send = `dm.write tweet.read users.read`; keys read = `dm.read
tweet.read users.read`, keys add = `dm.write tweet.read users.read`
(ref:*). OAuth 1.0a is not documented for X Chat and app-only tokens only work
for the activity stream (realtime).

**What this means for Social0.** X is connected today with OAuth 1.0a only
(`connect/platform-start.ts`, `PLATFORM_OAUTH_CONFIG.twitter_x = null` in
`lib/platforms.ts`). The OAuth 1.0a token keeps working for publishing,
comments, analytics and legacy DMs, so we should not replace it. X Chat needs a
**second token**, an OAuth 2.0 user token for the same X user:

- Every X account must **re-consent** once through a new OAuth 2.0 + PKCE flow
  (the existing connect code already has a PKCE path for other platforms) with
  `dm.read dm.write tweet.read users.read offline.access media.write`.
  `offline.access` is not mentioned on the chat pages; it is X's general
  refresh-token scope. Without it the user would have to reconnect every time
  the access token expires.
- The X app needs OAuth 2.0 turned on and a client id/secret. Those are new
  env vars; `backend/.env.example` today only has `TWITTER_CONSUMER_KEY` /
  `TWITTER_CONSUMER_SECRET`.
- Storage: `connected_accounts` already uses `encrypted_access_token` and
  `encrypted_refresh_token` for the OAuth 1.0a token and secret
  (`lib/account-access.ts`). The OAuth 2.0 pair needs another home. Without a
  migration, the `ENCRYPTION_KEY`-encrypted tokens could go in
  `platform_metadata` (jsonb) with their expiry. Proper columns, or a small
  `connected_account_credentials` table, need a migration. **Owner decision;
  nothing here changes the schema.**
- The callback must check that the OAuth 2.0 user id equals the row's
  `platform_user_id`, so the second token can't be attached to the wrong account.
- Token refresh belongs in the existing `token.refresh` / health sweep.
- If the user refuses `dm.*`, nothing else breaks: the X DM pane keeps the
  legacy view plus the banner from §5.

---

## 2. Key custody

To decrypt, a client needs the user's identity and signing private keys. The
docs offer three ways to get them (keys, xdk, getting-started):

1. **Secure key backup (Juicebox).** `setup(passcode)` the first time,
   `unlock(passcode)` after that. The user's X Chat passcode/PIN recovers the
   keys. The XDK takes the `juicebox_config` from the public-key record plus a
   `getAuthToken(realmId)` callback that "the app backend" supplies.
2. **Exported key blob.** `export_keys` / `import_keys` produce an opaque blob,
   available **only in the native bindings** (Python, Go, .NET, JVM, Rust).
   "The JS/WASM binding does not expose raw key export or import" (xdk).
3. **New keypairs** via `generate_keypairs`, "once per device/app identity".

The docs' own guidance by app type (keys):

- User web UI: browser WASM Chat XDK with setup/unlock. "Do not send PIN or
  keys to your servers"; no raw key blobs in localStorage.
- Bot or server acting **as its own account**: export blob in a secret manager
  or HSM.
- Ciphertext-only proxy: holds no private keys.
- And plainly: "Never ask end users to share their encryption PIN or private
  keys with a third-party server, support agent, or 'helper' app." Also:
  "there is no server-side 'revoke this key' for a pure client-held root key
  today", and revoking OAuth "does not invalidate private keys the user
  already gave away."

### Option A: decrypt in the browser (recommended)

The SPA loads `@xdevplatform/chat-xdk`, the user types their X Chat passcode
into Social0, `unlock()` runs in the page, and keys stay in page memory
(`lock()`/`free()` on logout or tab close). The server stays a
**ciphertext-only proxy**: it holds the OAuth 2.0 token, calls the X Chat
endpoints, caches and returns the encoded events, and forwards an
already-encrypted send payload. Decrypted text never reaches the API, Redis,
logs or Sentry.

Upsides:

- It matches X's documented pattern for this kind of app, and it is the only
  option that does not break the "never send the PIN to a server" rule.
- A server breach (DB plus `ENCRYPTION_KEY`) exposes OAuth tokens, which can be
  revoked, but no DM plaintext or keys.
- The existing server rules still hold: live reads, `withPlatformReadCache`
  (caching ciphertext is harmless), 429 throw → cooldown.

Costs and risks, plainly:

- **The passcode is still typed into Social0's page.** End-to-end encryption
  becomes "X plus whatever JS runs on social0.app." Any XSS or compromised
  third-party script on the dashboard can read the passcode and the unlocked
  keys. Today `frontend/index.html` sets `script-src 'self' 'unsafe-inline'`
  plus about ten third-party analytics origins. Mitigation: run the XDK in an
  isolated surface, either a sandboxed iframe on its own origin with a strict
  CSP and no third-party scripts that talks to the dashboard by
  `postMessage`, or at least an inbox route with those scripts removed. The
  CSP also needs `'wasm-unsafe-eval'` for WASM, and `connect-src` needs the
  Juicebox realm hosts (unknown until the config is fetched).
- **Wrong passcode guesses count against the user's real X account.** Realms
  "rate-limit wrong guesses and can lock recovery after too many failures"
  (troubleshooting). A typo loop in Social0 can lock the user out of their own
  X history. The UI needs a clear attempt count and must never retry on its own.
- Unlock happens once per page load (keys holds memory-only as the default),
  so users re-enter the passcode each session. Persisting with Web Crypto
  non-extractable keys is allowed but adds risk; leave it out of v1.
- **Server-side callers can't read encrypted X DMs.** `/v1/inbox/dms*`, the
  hosted MCP worker and the reply-verification path (`verify-dm.ts`) only see
  ciphertext. They should return a clear `encrypted` status, not empty
  threads. The CLI runs on the user's own machine, so it could later
  decrypt locally with a native XDK. That is out of scope here.
- **Teams.** A community or member teammate replying for a brand would need
  the account owner's X Chat passcode, which the docs tell users never to
  share. For encrypted X chats, only the account owner can read them in
  Social0. Team inboxes show the encrypted badge plus "open on X".
- The JS install docs target Node 18+. Browser support is described only on
  the unread WASM guide, and `getAuthToken(realmId)` needs a realm token
  "supplied by the app backend" whose source the pages read do not explain.
  Both must be confirmed in the Phase 1 spike.

### Option B: key blobs on the server, encrypted with `ENCRYPTION_KEY` (rejected)

- It needs the user's passcode on the server (Juicebox unlock), or a native
  `export_keys` sidecar. That means Python, Go, Rust or similar next to a
  Node/TS API, because the JS binding cannot export. The docs say not to do
  either for end users.
- Blast radius: `ENCRYPTION_KEY` is one key shared by the API and the publish
  worker. If it leaks along with the DB, every tenant's full X DM history is
  readable, history counts as exposed for good ("treat historical ciphertext
  as exposed"), and nothing can revoke it on the server.
- Upside: it would keep `/v1`, MCP, teams and server-side reply checks working.
  That is real, but it does not justify holding every customer's chat root
  keys.

### Option C: register a Social0 keypair as an extra "device" (open question)

`generate_keypairs` says "per device/app identity". If X let an app register
its own key alongside the user's phone, without the PIN and without disturbing
the user's other devices, that would be cleaner than A or B. The docs do not
say whether a second identity key per user is allowed, how peers pick a
`public_key_version`, or whether registering replaces the user's key. Doing
this blind could break the user's X chats on their phone. **Do not build this;
ask X.**

**Recommendation: Option A, in an isolated iframe, owner-only for encrypted
chats.** Server code stays a ciphertext proxy.

---

## 3. Is history from before Social0 had keys readable?

- **Pre-encryption messages:** yes. Events without `conversation_key_version`
  are unencrypted (ref:events). They still need XDK decoding, not keys. The
  legacy API also still returns them.
- **Encrypted history:** probably yes, but only because Option A uses the
  user's **own** identity keys (recovered through Juicebox), the same as a new
  phone. History decrypts from `meta.conversation_key_events` in the events
  response (troubleshooting), and every key version wrapped to that identity
  should open. The docs never say outright that a newly unlocked client can
  decrypt all past versions. **Verify in the spike** against an old thread on
  the owner's account.
- Not readable: anything from before a key reset or lost passcode ("Losing the
  passcode or an unprotected key blob can prevent decrypting past messages",
  getting-started), old events whose signer left a group (permanent
  verification failure; show as tombstones), and disappearing messages
  (`message_ttl_ms`) after they expire.
- Option C, if X ever allows it, would almost certainly see only messages sent
  after its key was added.

---

## 4. API status, rate limits, pricing

- **Status:** none of the pages read say GA, beta or preview. The changelog
  entries read (Oct 2026 back to Nov 2021) have no X Chat launch entry.
  **Unspecified.**
- **Access tier:** not stated on any chat page. **Unspecified.**
- **Rate limits:** the rate-limits page has **no `/2/chat/*` or
  `/2/users/:id/public_keys` rows**. The legacy DM read rows are 15 requests
  per 15 minutes per user, which is why `X_DM_LIST_PAGE_CAP` exists. A 429 uses
  the usual `{"errors":[{"code":88,...}]}` shape (rate-limits). Activity stream
  allows 450 per 15 minutes per app with 2 connections (rate-limits).
  **Chat limits unspecified**; read `x-rate-limit-*` headers in the spike.
- **Pricing:** the pricing page is pay-per-use and lists no chat endpoints by
  name. Rows that may apply: "DM Event: Read" $0.010 per resource and "DM
  Interaction: Create" $0.015 per request. Webhook `chat.received` costs $0.010
  per event; `chat.sent` and `chat.conversation_join` are not billed (pricing).
  Whether chat REST calls bill under the DM rows is **unspecified**. At
  $0.01 per event read, a 50-event thread page could cost $0.50, so budget it
  and confirm with X.
- **Legacy deprecation:** nothing in the docs deprecates `/2/dm_events`, and
  the rate-limits page still lists it. Whether X will keep plaintext DMs
  flowing there is unspecified. Our evidence is that encrypted conversations
  simply don't show up there.

---

## 5. Phased plan

Rules from root `CLAUDE.md` §8 apply throughout: reads are live, one read is
roughly one platform call, every read goes through
`withPlatformReadCache`, fetchers throw on 429, `LIVE_PLATFORMS` stays
backend-only, and service functions come in session/`*ForScope` pairs.

**Phase 0: now, no new API (small SPA + copy change).**
In the X DM pane (`frontend/src/features/dashboard/inbox/InboxDmsPane.tsx` /
`InboxStatusBanners.tsx`) show a dismissible note for X accounts: "X moved
most chats to encrypted X Chat. Newer conversations may only appear on X." Add
an "Open on X" link (`https://x.com/i/chat`). Keep it a static note; don't
try to guess which threads are stale. No schema change. `/v1` and MCP can add the same hint to their X DM responses.

**Phase 1: spike (owner account only, throwaway).**
Connect a test OAuth 2.0 token for @abhitwt by hand. From a scratch page, call
list and events, unlock with the passcode in the WASM XDK, decrypt one old and
one new thread, and send one encrypted reply. Record: browser WASM works, CSP
needs, where the Juicebox realm token comes from, real rate-limit headers,
billing per call, whether old key versions decrypt (§3), and the
`receives_your_chat` values. **Go/no-go gate.**

**Phase 2: second token (needs the owner's call on storage, §1).**
OAuth 2.0 PKCE connect for `twitter_x` as an "Enable X Chat" upgrade on the
existing account row. Refresh in the token sweep. A missing or expired chat
token maps to the existing reconnect path (`scope_missing` with a new
`missingScopes` entry such as `x_chat`, via `lib/platform-auth-errors.ts`).

**Phase 3: read path (server proxy + SPA decrypt).**
- Server: `fetchXChatList` uses **one** `GET /chat/conversations` call
  (`expansions=participant_ids`, `user.fields`), cached under `inbox_dms`
  on the same fixed lookback. It returns metadata only. The list response has
  no message body, so **no snippet** (show "Encrypted chat" plus time, unread
  from `unread`). Fetching each conversation's events for a snippet would break
  "one read ≈ one platform call".
- `fetchXChatThread` uses one `GET /chat/conversations/{id}/events` page,
  cached under `inbox_dm_thread` with the `cursor`/`nextCursor` paging the
  pane already has. It returns raw `encoded_event`s plus
  `conversation_key_events`; a new `encrypted: true` result shape tells the SPA
  to decrypt.
- Merge: for accounts with a chat token, list X Chat conversations first and
  keep legacy `dm_events` threads that X Chat doesn't return. Dedupe by
  conversation id; the id formats look compatible (`A-B`), but confirm that.
- SPA: an unlock prompt per session, `decryptEvents` (batch; per-event
  failures show as "couldn't decrypt"), decrypted text kept only in memory
  (never in any persisted query cache or localStorage).
- Same 429 rule: throw so the cooldown applies; never fold a 429 into
  `status: "error"`.

**Phase 4: replies.**
SPA `encryptMessage` → server `inbox.replyDm` forwards the encoded payload to
`POST /chat/conversations/{id}/messages`. If `receives_your_chat` says
unencrypted, send `content` from the server as today. Reply verification
switches to "X returned 201 + `encoded_message_event`" instead of re-reading
the list. Media replies come later (chat media upload + `encryptStream`).

**Phase 5 (optional): real time.** `chat.received` webhooks would replace
polling, but they are billed per event and the payload is ciphertext, so the
server can only use them as "something changed, invalidate cache" signals.
Only worth it if Phase 3 polling costs too much.

**Meanwhile, for legacy-only users** (no chat token, or they declined): keep
today's legacy path untouched, show the Phase 0 note, and in `/v1`/MCP return
the hint so agents tell users the same. Never present the legacy list as
complete for X.

---

## Open questions for X (the docs don't answer)

1. GA/beta status, access tier, chat rate limits, and which pricing rows chat
   calls bill under.
2. Is a Social0 app identity key (Option C) supported without disturbing the
   user's devices?
3. Where does a third-party web app get the Juicebox realm auth token for
   `getAuthToken`?
4. Does a client that unlocks via Juicebox get every historical conversation
   key version?
5. Which `ChatMessageEvent` fields are plaintext by design (`sender_id`,
   `created_at`), and what is `is_trusted`?
6. Is OAuth 1.0a supported on chat endpoints (the OpenAPI lists an
   undocumented generic `UserToken` scheme)?
7. Will `/2/dm_events` keep serving unencrypted conversations, and on what
   timeline?
8. Docs inconsistencies: the add-public-key body in the getting-started
   snippets doesn't match the OpenAPI `{ public_key: {...} }` wrapper.
