/**
 * Live DM fetchers. Failures degrade - never throw past the dispatcher.
 * Instagram, X, Bluesky, TikTok Business Messaging.
 */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";
import { jsonGet } from "../http-json.js";
import { inDateWindow } from "../date-window.js";
import {
  graphPictureUrl,
  peerFromParticipants,
  type InboxAttachment,
  type InboxDmMessage,
  type InboxDmThread,
} from "./types.js";
import { inboxDmMediaKinds } from "./media-capabilities.js";
import { blueskySession, blueskySessionAfter401 } from "./bluesky-session.js";
import {
  parseGraphAttachments,
  withMediaFallback,
  xMediaToAttachment,
  type XMediaLike,
} from "./parse-attachment.js";
import { mapPool } from "../map-pool.js";
import {
  isTikTokBmOwnMessage,
  tiktokBmConversations,
  tiktokBmCursor,
  tiktokBmData,
  tiktokBmErrorMessage,
  tiktokBmGet,
  tiktokBmListFailed,
  tiktokBmPost,
  type TikTokBmEnvelope,
} from "./tiktok-bm.js";

export type DmAccount = {
  id: string;
  platform: string;
  platformUserId: string;
  platformUsername: string | null;
  profileImageUrl?: string | null;
  accessToken: string;
  accessSecret?: string | null;
};

export type DmListFetchResult = {
  threads: InboxDmThread[];
  status: "ok" | "scope_missing" | "unsupported" | "error";
  error?: string;
  missingScopes?: string[];
};

export type DmThreadFetchResult = {
  messages: InboxDmMessage[];
  thread?: InboxDmThread;
  status: "ok" | "scope_missing" | "unsupported" | "error";
  error?: string;
  missingScopes?: string[];
};

type GraphPerson = {
  id?: string;
  name?: string;
  username?: string;
  picture?: unknown;
};

function threadMeta(
  account: DmAccount,
  partial: Omit<
    InboxDmThread,
    "platform" | "accountId" | "accountLabel" | "accountProfileImageUrl" | "mediaKinds"
  >,
): InboxDmThread {
  return {
    platform: account.platform,
    accountId: account.id,
    accountLabel: account.platformUsername,
    accountProfileImageUrl: account.profileImageUrl ?? null,
    mediaKinds: inboxDmMediaKinds(account.platform),
    ...partial,
  };
}

const GRAPH_MSG_ATTACHMENT_FIELDS =
  "attachments{type,mime_type,image_data,video_data,payload,file_url}";

function personAvatar(person: GraphPerson | undefined): string | null {
  return graphPictureUrl(person?.picture);
}

function graphErr(message: string, missingScopes?: string[]): DmListFetchResult {
  return {
    threads: [],
    status: missingScopes?.length ? "scope_missing" : "error",
    error: message,
    missingScopes,
  };
}

function graphMsg(
  message: string,
  missingScopes?: string[],
): DmThreadFetchResult {
  return {
    messages: [],
    status: missingScopes?.length ? "scope_missing" : "error",
    error: message,
    missingScopes,
  };
}

function graphPeople(raw: unknown): GraphPerson[] {
  if (Array.isArray(raw)) return raw as GraphPerson[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: GraphPerson[] }).data;
  }
  return [];
}

function snippetOf(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function fetchAccountDms(
  account: DmAccount,
  since: Date,
  until: Date,
): Promise<DmListFetchResult> {
  switch (account.platform) {
    case "instagram":
      return fetchInstagramList(account, since, until);
    case "twitter_x":
      return fetchTwitterList(account, since, until);
    case "bluesky":
      return fetchBlueskyList(account, since, until);
    case "tiktok":
      return fetchTikTokList(account, since, until);
    default:
      return { threads: [], status: "unsupported" };
  }
}

export async function fetchDmMessages(
  account: DmAccount,
  conversationId: string,
  peerId: string,
): Promise<DmThreadFetchResult> {
  switch (account.platform) {
    case "instagram":
      return fetchInstagramThread(account, conversationId);
    case "twitter_x":
      return fetchTwitterThread(account, conversationId, peerId);
    case "bluesky":
      return fetchBlueskyThread(account, conversationId);
    case "tiktok":
      return fetchTikTokThread(account, conversationId);
    default:
      return { messages: [], status: "unsupported" };
  }
}

function isMessagingPermissionError(msg: string): boolean {
  return /permission|#200|#10|manage_messages|messaging/i.test(
    msg,
  );
}

type GraphPage = {
  data?: Array<Record<string, unknown>>;
  paging?: { next?: string };
};

async function restOfGraphPages(
  first: GraphPage,
  since: Date,
  timeField: string,
  cap = 8,
): Promise<Array<Record<string, unknown>>> {
  const out = [...(first.data ?? [])];
  let next = first.paging?.next ?? null;
  const sinceMs = since.getTime();
  for (let page = 1; next && page < cap; page++) {
    const oldest = out.length
      ? Date.parse(String(out[out.length - 1]?.[timeField] ?? ""))
      : 0;
    if (oldest && oldest < sinceMs) break;
    const pageRes = await jsonGet(next);
    if (!pageRes.ok) break;
    const body = pageRes.data as GraphPage;
    out.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
  }
  return out;
}

async function fetchInstagramList(
  account: DmAccount,
  since: Date,
  until: Date,
): Promise<DmListFetchResult> {
  const id = encodeURIComponent(account.platformUserId);
  const fields =
    `id,updated_time,participants{id,username,name,picture},messages.limit(1){message,created_time,from,${GRAPH_MSG_ATTACHMENT_FIELDS}}`;
  const url = `https://graph.instagram.com/v21.0/${id}/conversations?platform=instagram&fields=${encodeURIComponent(fields)}&limit=50&access_token=${encodeURIComponent(account.accessToken)}`;
  const { ok, data } = await jsonGet(url);
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "Instagram DMs failed";
    return graphErr(
      msg,
      isMessagingPermissionError(msg)
        ? ["instagram_business_manage_messages"]
        : undefined,
    );
  }
  const rows = await restOfGraphPages(data as GraphPage, since, "updated_time");
  const threads: InboxDmThread[] = [];
  for (const row of rows) {
    const updated =
      typeof row.updated_time === "string" ? row.updated_time : null;
    if (!inDateWindow(updated, since, until, { keepUndated: false })) continue;
    const peer = peerFromParticipants(
      graphPeople(row.participants),
      account.platformUserId,
    );
    const last =
      (row.messages as { data?: Array<{ message?: string }> } | undefined)
        ?.data?.[0];
    threads.push(
      threadMeta(account, {
        conversationId: String(row.id ?? ""),
        peerId: peer.id,
        peerName: peer.name,
        peerHandle: peer.handle,
        peerAvatarUrl: peer.avatarUrl,
        lastMessageAt: updated,
        snippet: snippetOf(last?.message),
        canReply: Boolean(peer.id),
      }),
    );
  }
  return { threads, status: "ok" };
}

function graphMessagesToInbox(
  rows: Array<Record<string, unknown>>,
  account: DmAccount,
  avatarById: Map<string, string | null>,
): InboxDmMessage[] {
  const out: InboxDmMessage[] = [];
  for (const row of rows) {
    const from = row.from as GraphPerson | undefined;
    const isOwn = Boolean(from?.id && from.id === account.platformUserId);
    const media = withMediaFallback(
      String(row.message ?? ""),
      parseGraphAttachments(row.attachments),
    );
    out.push({
      id: String(row.id ?? ""),
      text: media.text,
      createdAt:
        typeof row.created_time === "string" ? row.created_time : null,
      isOwn,
      authorName: isOwn
        ? "You"
        : (from?.name ?? from?.username ?? "Unknown"),
      authorHandle: from?.username ?? from?.id ?? null,
      authorAvatarUrl: isOwn
        ? account.profileImageUrl ?? null
        : (from?.id ? avatarById.get(from.id) : null) ?? personAvatar(from),
      attachment: media.attachment,
    });
  }
  out.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  return out;
}

function participantAvatars(participants: GraphPerson[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const p of participants) {
    if (p.id) map.set(p.id, personAvatar(p));
  }
  return map;
}

async function fetchInstagramThread(
  account: DmAccount,
  conversationId: string,
): Promise<DmThreadFetchResult> {
  const token = encodeURIComponent(account.accessToken);
  const id = encodeURIComponent(conversationId);
  const url = `https://graph.instagram.com/v21.0/${id}?fields=id,updated_time,participants{id,username,name,picture}&access_token=${token}`;
  const { ok, data } = await jsonGet(url);
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "Instagram thread failed";
    return graphMsg(
      msg,
      isMessagingPermissionError(msg)
        ? ["instagram_business_manage_messages"]
        : undefined,
    );
  }
  const row = data as Record<string, unknown>;
  const participants = graphPeople(row.participants);
  const peer = peerFromParticipants(participants, account.platformUserId);
  const avatars = participantAvatars(participants);
  const msgUrl = `https://graph.instagram.com/v21.0/${id}/messages?fields=id,created_time,from,message,${GRAPH_MSG_ATTACHMENT_FIELDS}&limit=50&access_token=${token}`;
  const msgRes = await jsonGet(msgUrl);
  if (!msgRes.ok) {
    const msg =
      (msgRes.data as { error?: { message?: string } })?.error?.message ??
      "Instagram thread failed";
    return graphMsg(
      msg,
      isMessagingPermissionError(msg)
        ? ["instagram_business_manage_messages"]
        : undefined,
    );
  }
  const msgs = await restOfGraphPages(
    msgRes.data as GraphPage,
    new Date(0),
    "created_time",
  );
  const messages = graphMessagesToInbox(msgs, account, avatars);
  const last = messages[messages.length - 1];
  return {
    messages,
    status: "ok",
    thread: threadMeta(account, {
      conversationId,
      peerId: peer.id,
      peerName: peer.name,
      peerHandle: peer.handle,
      peerAvatarUrl: peer.avatarUrl,
      lastMessageAt: last?.createdAt ?? (typeof row.updated_time === "string" ? row.updated_time : null),
      snippet: snippetOf(last?.text || (last?.attachment ? `[${last.attachment.type}]` : "")),
      canReply: Boolean(peer.id),
    }),
  };
}

type XDmEvent = {
  id?: string;
  text?: string;
  event_type?: string;
  dm_conversation_id?: string;
  created_at?: string;
  sender_id?: string;
  participant_ids?: string[];
  attachments?: Array<{ media_keys?: string[] }>;
};

type XUser = {
  id: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
};

type XMedia = XMediaLike;

function xMediaAttachment(
  ev: XDmEvent,
  mediaByKey: Map<string, XMedia>,
): InboxAttachment | null {
  const key = ev.attachments?.[0]?.media_keys?.[0];
  if (!key) return null;
  return xMediaToAttachment(mediaByKey.get(key));
}

function twitterClient(account: DmAccount): TwitterApi | null {
  const appKey = env.TWITTER_CONSUMER_KEY;
  const appSecret = env.TWITTER_CONSUMER_SECRET;
  if (!appKey || !appSecret || !account.accessSecret) return null;
  return new TwitterApi({
    appKey,
    appSecret,
    accessToken: account.accessToken,
    accessSecret: account.accessSecret,
  });
}

function isTwitterDmDenied(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /403|401|forbidden|not permitted|direct message/i.test(msg);
}

async function fetchTwitterList(
  account: DmAccount,
  since: Date,
  until: Date,
): Promise<DmListFetchResult> {
  const client = twitterClient(account);
  if (!client) {
    return graphErr("X credentials incomplete. Reconnect the account.");
  }
  try {
    const events: XDmEvent[] = [];
    const users = new Map<string, XUser>();
    const mediaByKey = new Map<string, XMedia>();
    let paginationToken: string | undefined;
    for (let page = 0; page < 5; page++) {
      const raw = (await client.v2.get("dm_events", {
        max_results: 100,
        event_types: "MessageCreate",
        "dm_event.fields":
          "id,text,event_type,dm_conversation_id,created_at,sender_id,participant_ids,attachments",
        expansions: "sender_id,participant_ids,attachments.media_keys",
        "user.fields": "name,username,profile_image_url",
        "media.fields": "url,preview_image_url,type,variants",
        ...(paginationToken ? { pagination_token: paginationToken } : {}),
      })) as {
        data?: XDmEvent[];
        includes?: { users?: XUser[]; media?: XMedia[] };
        meta?: { next_token?: string };
      };
      const pageEvents = (raw.data ?? []).filter(
        (e) => e.event_type === "MessageCreate" || !e.event_type,
      );
      events.push(...pageEvents);
      for (const u of raw.includes?.users ?? []) users.set(u.id, u);
      for (const m of raw.includes?.media ?? []) {
        if (m.media_key) mediaByKey.set(m.media_key, m);
      }
      const oldest = pageEvents.reduce((min, ev) => {
        const t = Date.parse(ev.created_at ?? "");
        return Number.isFinite(t) && t < min ? t : min;
      }, Number.POSITIVE_INFINITY);
      paginationToken = raw.meta?.next_token;
      if (!paginationToken) break;
      if (Number.isFinite(oldest) && oldest < since.getTime()) break;
    }
    const byConvo = new Map<string, XDmEvent[]>();
    for (const ev of events) {
      const cid = ev.dm_conversation_id;
      if (!cid) continue;
      const list = byConvo.get(cid) ?? [];
      list.push(ev);
      byConvo.set(cid, list);
    }
    const threads: InboxDmThread[] = [];
    for (const [conversationId, list] of byConvo) {
      list.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
      const last = list[list.length - 1];
      if (!inDateWindow(last?.created_at ?? null, since, until, { keepUndated: false })) continue;
      const participantIds = new Set<string>();
      for (const ev of list) {
        for (const pid of ev.participant_ids ?? []) participantIds.add(pid);
        if (ev.sender_id) participantIds.add(ev.sender_id);
      }
      participantIds.delete(account.platformUserId);
      const peerId = [...participantIds][0] ?? "";
      const peer = peerId ? users.get(peerId) : undefined;
      const attachment = last ? xMediaAttachment(last, mediaByKey) : null;
      threads.push(
        threadMeta(account, {
          conversationId,
          peerId,
          peerName: peer?.name ?? peer?.username ?? "X user",
          peerHandle: peer?.username ?? null,
          peerAvatarUrl: peer?.profile_image_url ?? null,
          lastMessageAt: last?.created_at ?? null,
          snippet: snippetOf(last?.text || (attachment ? `[${attachment.type}]` : "")),
          canReply: Boolean(peerId),
        }),
      );
    }
    threads.sort((a, b) =>
      (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
    );
    return { threads, status: "ok" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "X DMs failed";
    return graphErr(
      msg,
      isTwitterDmDenied(e) ? ["Direct Messages Read and Write"] : undefined,
    );
  }
}

async function fetchTwitterThread(
  account: DmAccount,
  conversationId: string,
  peerId: string,
): Promise<DmThreadFetchResult> {
  const client = twitterClient(account);
  if (!client) {
    return graphMsg("X credentials incomplete. Reconnect the account.");
  }
  try {
    const events: XDmEvent[] = [];
    const users = new Map<string, XUser>();
    const mediaByKey = new Map<string, XMedia>();
    let paginationToken: string | undefined;
    for (let page = 0; page < 5; page++) {
      const raw = (await client.v2.get(
        `dm_conversations/${encodeURIComponent(conversationId)}/dm_events`,
        {
          max_results: 100,
          event_types: "MessageCreate",
          "dm_event.fields":
            "id,text,event_type,dm_conversation_id,created_at,sender_id,attachments",
          expansions: "sender_id,attachments.media_keys",
          "user.fields": "name,username,profile_image_url",
          "media.fields": "url,preview_image_url,type,variants",
          ...(paginationToken ? { pagination_token: paginationToken } : {}),
        },
      )) as {
        data?: XDmEvent[];
        includes?: { users?: XUser[]; media?: XMedia[] };
        meta?: { next_token?: string };
      };
      const pageEvents = (raw.data ?? []).filter(
        (e) => e.event_type === "MessageCreate" || !e.event_type,
      );
      events.push(...pageEvents);
      for (const u of raw.includes?.users ?? []) users.set(u.id, u);
      for (const m of raw.includes?.media ?? []) {
        if (m.media_key) mediaByKey.set(m.media_key, m);
      }
      paginationToken = raw.meta?.next_token;
      if (!paginationToken) break;
    }
    const unique = new Map<string, XDmEvent>();
    for (const ev of events) {
      if (ev.id) unique.set(ev.id, ev);
    }
    const sorted = [...unique.values()].sort((a, b) =>
      (a.created_at ?? "").localeCompare(b.created_at ?? ""),
    );
    const messages: InboxDmMessage[] = sorted.map((ev) => {
      const isOwn = ev.sender_id === account.platformUserId;
      const user = ev.sender_id ? users.get(ev.sender_id) : undefined;
      const media = withMediaFallback(
        ev.text ?? "",
        xMediaAttachment(ev, mediaByKey),
      );
      return {
        id: String(ev.id ?? ""),
        text: media.text,
        createdAt: ev.created_at ?? null,
        isOwn,
        authorName: isOwn ? "You" : (user?.name ?? user?.username ?? "X user"),
        authorHandle: user?.username ?? null,
        authorAvatarUrl: isOwn
          ? account.profileImageUrl ?? null
          : user?.profile_image_url ?? null,
        attachment: media.attachment,
      };
    });
    const last = messages[messages.length - 1];
    const peer = peerId ? users.get(peerId) : undefined;
    return {
      messages,
      status: "ok",
      thread: threadMeta(account, {
        conversationId,
        peerId,
        peerName: peer?.name ?? peer?.username ?? "X user",
        peerHandle: peer?.username ?? null,
        peerAvatarUrl: peer?.profile_image_url ?? null,
        lastMessageAt: last?.createdAt ?? null,
        snippet: snippetOf(last?.text || (last?.attachment ? `[${last.attachment.type}]` : "")),
        canReply: Boolean(peerId),
      }),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "X thread failed";
    return graphMsg(
      msg,
      isTwitterDmDenied(e) ? ["Direct Messages Read and Write"] : undefined,
    );
  }
}

const BSKY_CHAT_PROXY = "did:web:api.bsky.chat#bsky_chat";

async function blueskyChat(
  jwt: string,
  nsid: string,
  opts?: { method?: "GET" | "POST"; params?: Record<string, string>; body?: unknown },
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = new URL(`https://api.bsky.chat/xrpc/${nsid}`);
  if (opts?.params) {
    for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    method: opts?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Atproto-Proxy": BSKY_CHAT_PROXY,
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function blueskyChatAuthed(
  account: DmAccount,
  handle: string,
  nsid: string,
  opts?: { method?: "GET" | "POST"; params?: Record<string, string>; body?: unknown },
): Promise<{
  ok: boolean;
  data: unknown;
  session: { accessJwt: string; did: string } | null;
}> {
  let session = await blueskySession(account.id, handle, account.accessSecret!);
  if (!session) return { ok: false, data: { message: "Bluesky login failed. Reconnect the account." }, session: null };
  let result = await blueskyChat(session.accessJwt, nsid, opts);
  if (result.status === 401) {
    session = await blueskySessionAfter401(account.id, handle, account.accessSecret!);
    if (!session) return { ok: false, data: { message: "Bluesky login failed. Reconnect the account." }, session: null };
    result = await blueskyChat(session.accessJwt, nsid, opts);
  }
  return { ok: result.ok, data: result.data, session };
}

type BskyMember = {
  did?: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
};
type BskyConvo = {
  id?: string;
  members?: BskyMember[];
  lastMessage?: { text?: string; sentAt?: string; sender?: { did?: string } };
};

function bskyPeer(members: BskyMember[] | undefined, selfDid: string): BskyMember {
  return members?.find((m) => m.did && m.did !== selfDid) ?? members?.[0] ?? {};
}

async function fetchBlueskyList(
  account: DmAccount,
  since: Date,
  until: Date,
): Promise<DmListFetchResult> {
  const handle = account.platformUsername;
  if (!handle || !account.accessSecret) {
    return graphErr("Bluesky credentials incomplete. Reconnect the account.");
  }
  const convos: BskyConvo[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let session: { accessJwt: string; did: string } | null = null;
  for (let page = 0; page < 8; page++) {
    const { ok, data, session: nextSession } = await blueskyChatAuthed(
      account,
      handle,
      "chat.bsky.convo.listConvos",
      {
        params: {
          limit: "50",
          ...(cursor ? { cursor } : {}),
        },
      },
    );
    session = nextSession;
    if (!session) {
      return graphErr("Bluesky login failed. Reconnect the account.");
    }
    if (!ok) {
      if (convos.length) break;
      const msg =
        (data as { message?: string })?.message ?? "Bluesky chat failed";
      return graphErr(msg);
    }
    const pageConvos = (data as { convos?: BskyConvo[] }).convos ?? [];
    for (const c of pageConvos) {
      if (!c.id || seen.has(c.id)) continue;
      seen.add(c.id);
      convos.push(c);
    }
    const oldest = pageConvos.reduce((min, c) => {
      const t = Date.parse(c.lastMessage?.sentAt ?? "");
      return Number.isFinite(t) && t < min ? t : min;
    }, Number.POSITIVE_INFINITY);
    cursor =
      typeof (data as { cursor?: string }).cursor === "string"
        ? (data as { cursor: string }).cursor
        : undefined;
    if (!cursor) break;
    if (Number.isFinite(oldest) && oldest < since.getTime()) break;
  }
  if (!session) {
    return graphErr("Bluesky login failed. Reconnect the account.");
  }
  const threads: InboxDmThread[] = [];
  for (const convo of convos) {
    if (!convo.id) continue;
    const sentAt = convo.lastMessage?.sentAt ?? null;
    if (!inDateWindow(sentAt, since, until, { keepUndated: false })) continue;
    const peer = bskyPeer(convo.members, session.did);
    threads.push(
      threadMeta(account, {
        conversationId: convo.id,
        peerId: peer.did ?? "",
        peerName: peer.displayName ?? peer.handle ?? "Bluesky user",
        peerHandle: peer.handle ?? null,
        peerAvatarUrl: peer.avatar ?? null,
        lastMessageAt: sentAt,
        snippet: snippetOf(convo.lastMessage?.text),
        canReply: true,
      }),
    );
  }
  return { threads, status: "ok" };
}

type BskyChatMessage = {
  id?: string;
  text?: string;
  sentAt?: string;
  sender?: { did?: string };
};

async function fetchBlueskyThread(
  account: DmAccount,
  conversationId: string,
): Promise<DmThreadFetchResult> {
  const handle = account.platformUsername;
  if (!handle || !account.accessSecret) {
    return graphMsg("Bluesky credentials incomplete. Reconnect the account.");
  }
  const [msgsPages, convoRes] = await Promise.all([
    (async () => {
      const rows: BskyChatMessage[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      let last: {
        ok: boolean;
        data: unknown;
        session: { accessJwt: string; did: string } | null;
      } | null = null;
      for (let page = 0; page < 8; page++) {
        last = await blueskyChatAuthed(
          account,
          handle,
          "chat.bsky.convo.getMessages",
          {
            params: {
              convoId: conversationId,
              limit: "50",
              ...(cursor ? { cursor } : {}),
            },
          },
        );
        if (!last.ok) {
          if (rows.length) break;
          return last;
        }
        const pageRows =
          (last.data as { messages?: BskyChatMessage[] }).messages ?? [];
        for (const m of pageRows) {
          if (m.id && seen.has(m.id)) continue;
          if (m.id) seen.add(m.id);
          rows.push(m);
        }
        cursor =
          typeof (last.data as { cursor?: string }).cursor === "string"
            ? (last.data as { cursor: string }).cursor
            : undefined;
        if (!cursor) break;
      }
      return { ...last!, rows };
    })(),
    blueskyChatAuthed(account, handle, "chat.bsky.convo.getConvo", {
      params: { convoId: conversationId },
    }),
  ]);
  const session = msgsPages.session ?? convoRes.session;
  if (!session) {
    return graphMsg("Bluesky login failed. Reconnect the account.");
  }
  if (!msgsPages.ok && !("rows" in msgsPages && msgsPages.rows.length)) {
    const msg =
      (msgsPages.data as { message?: string })?.message ?? "Bluesky thread failed";
    return graphMsg(msg);
  }
  const rows =
    "rows" in msgsPages ? msgsPages.rows : [];
  const peer = bskyPeer(
    (convoRes.data as { convo?: BskyConvo })?.convo?.members,
    session.did,
  );
  const messages: InboxDmMessage[] = rows
    .map((m) => {
      const isOwn = m.sender?.did === session.did;
      return {
        id: String(m.id ?? ""),
        text: m.text ?? "",
        createdAt: m.sentAt ?? null,
        isOwn,
        authorName: isOwn
          ? "You"
          : (peer.displayName ?? peer.handle ?? "Bluesky user"),
        authorHandle: isOwn ? null : (peer.handle ?? null),
        authorAvatarUrl: isOwn
          ? account.profileImageUrl ?? null
          : peer.avatar ?? null,
      };
    })
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const last = messages[messages.length - 1];
  return {
    messages,
    status: "ok",
    thread: threadMeta(account, {
      conversationId,
      peerId: peer.did ?? "",
      peerName: peer.displayName ?? peer.handle ?? "Bluesky user",
      peerHandle: peer.handle ?? null,
      peerAvatarUrl: peer.avatar ?? null,
      lastMessageAt: last?.createdAt ?? null,
      snippet: snippetOf(last?.text),
      canReply: true,
    }),
  };
}

type TtConversation = {
  conversation_id?: string;
  update_time?: number;
};

type TtParticipant = {
  role?: string;
  id?: string;
  display_name?: string;
  profile_image?: string;
};

type TtMessage = {
  message_id?: string;
  timestamp?: number;
  text?: { body?: string };
  image?: { media_id?: string };
  video?: { media_id?: string };
  from_user?: { role?: string; id?: string };
  sender?: string;
};

function unixToIso(ts: number | undefined | null): string | null {
  if (!ts || !Number.isFinite(ts)) return null;
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function ttPeer(participants: TtParticipant[] | undefined, selfId: string): TtParticipant {
  const others = (participants ?? []).filter(
    (p) => p.id && p.id !== selfId && p.role !== "BUSINESS_ACCOUNT",
  );
  return others[0] ?? (participants ?? []).find((p) => p.id && p.id !== selfId) ?? {};
}

function ttMessages(raw: unknown): TtMessage[] {
  if (!Array.isArray(raw)) return [];
  return [...(raw as TtMessage[])].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
  );
}

function ttSnippet(last: TtMessage | undefined): string {
  return snippetOf(
    last?.text?.body || (last?.image ? "[image]" : last?.video ? "[video]" : ""),
  );
}

function ttBmFail(env: TikTokBmEnvelope, fallback: string): DmListFetchResult {
  return graphErr(tiktokBmErrorMessage(env, fallback));
}

function ttBmMsgFail(env: TikTokBmEnvelope, fallback: string): DmThreadFetchResult {
  return graphMsg(tiktokBmErrorMessage(env, fallback));
}

async function listTikTokConversations(
  account: DmAccount,
  conversationType: "SINGLE" | "STRANGER",
): Promise<{ ok: boolean; rows: TtConversation[]; error: TikTokBmEnvelope | null }> {
  const rows: TtConversation[] = [];
  let cursor: string | undefined;
  let lastEnv: TikTokBmEnvelope | null = null;
  for (let page = 0; page < 10; page++) {
    const query: Record<string, string> = {
      business_id: account.platformUserId,
      conversation_type: conversationType,
      limit: "100",
    };
    if (cursor) query.cursor = cursor;
    const { ok, data } = await tiktokBmGet(
      account.accessToken,
      "/business/message/conversation/list/",
      query,
    );
    lastEnv = data;
    if (!ok) {
      if (rows.length) return { ok: true, rows, error: data };
      return { ok: false, rows, error: data };
    }
    const inner = tiktokBmData(data);
    for (const c of tiktokBmConversations(inner)) {
      if (c.conversation_id) rows.push(c);
    }
    const next = tiktokBmCursor(inner);
    if (!next) break;
    cursor = next;
  }
  return { ok: true, rows, error: lastEnv };
}

async function fetchTikTokList(
  account: DmAccount,
  since: Date,
  until: Date,
): Promise<DmListFetchResult> {
  if (!account.platformUserId) {
    return graphErr("TikTok account id missing. Reconnect the account.");
  }
  const types = ["SINGLE", "STRANGER"] as const;
  const seen = new Set<string>();
  const rows: TtConversation[] = [];
  let lastErr: TikTokBmEnvelope | null = null;
  let anyOk = false;
  for (const conversationType of types) {
    const page = await listTikTokConversations(account, conversationType);
    if (!page.ok) {
      lastErr = page.error;
      continue;
    }
    anyOk = true;
    for (const c of page.rows) {
      if (!c.conversation_id || seen.has(c.conversation_id)) continue;
      seen.add(c.conversation_id);
      rows.push(c);
    }
  }
  if (
    tiktokBmListFailed({
      anyOk,
      lastErr: lastErr ? tiktokBmErrorMessage(lastErr, "TikTok DMs failed") : null,
      rowCount: rows.length,
    })
  ) {
    return ttBmFail(lastErr ?? {}, "TikTok DMs failed");
  }
  const inWindow = rows.filter((row) =>
    inDateWindow(unixToIso(row.update_time), since, until, { keepUndated: false }),
  );
  const details = await mapPool(inWindow, 4, async (row) => {
    const cid = row.conversation_id!;
    const detail = await tiktokBmGet(
      account.accessToken,
      "/business/message/content/list/",
      {
        business_id: account.platformUserId,
        conversation_id: cid,
      },
    );
    const inner = detail.ok ? tiktokBmData(detail.data) : {};
    const participants = (inner.participants as TtParticipant[] | undefined) ?? [];
    const messages = ttMessages(inner.messages);
    const last = messages[messages.length - 1];
    const peer = ttPeer(participants, account.platformUserId);
    return threadMeta(account, {
      conversationId: cid,
      peerId: peer.id ?? "",
      peerName: peer.display_name ?? "TikTok user",
      peerHandle: null,
      peerAvatarUrl: peer.profile_image ?? null,
      lastMessageAt: unixToIso(row.update_time),
      snippet: ttSnippet(last),
      canReply: true,
    });
  });
  details.sort((a, b) =>
    (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
  );
  const lookbackClamped =
    until.getTime() - since.getTime() > 90 * 24 * 60 * 60 * 1000;
  return {
    threads: details,
    status: "ok",
    error: lookbackClamped
      ? "TikTok DMs only go back 90 days."
      : undefined,
  };
}

async function ttMediaUrl(
  account: DmAccount,
  conversationId: string,
  message: TtMessage,
): Promise<InboxAttachment | null> {
  const imageId = message.image?.media_id;
  const videoId = message.video?.media_id;
  const mediaId = imageId || videoId;
  if (!mediaId || !message.message_id) return null;
  const { ok, data } = await tiktokBmPost(
    account.accessToken,
    "/business/message/media/download/",
    {
      business_id: account.platformUserId,
      conversation_id: conversationId,
      message_id: message.message_id,
      media_id: mediaId,
      media_type: videoId ? "VIDEO" : "IMAGE",
    },
  );
  const url = tiktokBmData(data).download_url;
  if (!ok || typeof url !== "string" || !url) return null;
  return { type: videoId ? "video" : "image", url };
}

async function fetchTikTokThread(
  account: DmAccount,
  conversationId: string,
): Promise<DmThreadFetchResult> {
  const rows: TtMessage[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let lastEnv: TikTokBmEnvelope | null = null;
  let participants: TtParticipant[] = [];
  for (let page = 0; page < 10; page++) {
    const query: Record<string, string> = {
      business_id: account.platformUserId,
      conversation_id: conversationId,
    };
    if (cursor) query.cursor = cursor;
    const { ok, data } = await tiktokBmGet(
      account.accessToken,
      "/business/message/content/list/",
      query,
    );
    lastEnv = data;
    if (!ok) {
      if (rows.length) break;
      return ttBmMsgFail(data, "TikTok conversation failed");
    }
    const inner = tiktokBmData(data);
    if (page === 0) {
      participants = (inner.participants as TtParticipant[] | undefined) ?? [];
    }
    for (const m of ttMessages(inner.messages)) {
      const id = m.message_id;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      rows.push(m);
    }
    const next = tiktokBmCursor(inner);
    if (!next) break;
    cursor = next;
  }
  if (!rows.length && lastEnv && lastEnv.code !== 0) {
    return ttBmMsgFail(lastEnv, "TikTok conversation failed");
  }
  rows.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const peer = ttPeer(participants, account.platformUserId);
  const attachments = await mapPool(rows, 4, (m) =>
    ttMediaUrl(account, conversationId, m),
  );
  const messages: InboxDmMessage[] = rows.map((m, i) => {
    const isOwn = isTikTokBmOwnMessage(m, account.platformUserId);
    return {
      id: String(m.message_id ?? ""),
      text: m.text?.body ?? "",
      createdAt: unixToIso(m.timestamp),
      isOwn,
      authorName: isOwn ? "You" : (peer.display_name ?? "TikTok user"),
      authorHandle: null,
      authorAvatarUrl: isOwn
        ? account.profileImageUrl ?? null
        : peer.profile_image ?? null,
      attachment: attachments[i] ?? null,
    };
  });
  const last = messages[messages.length - 1];
  return {
    messages,
    status: "ok",
    thread: threadMeta(account, {
      conversationId,
      peerId: peer.id ?? "",
      peerName: peer.display_name ?? "TikTok user",
      peerHandle: null,
      peerAvatarUrl: peer.profile_image ?? null,
      lastMessageAt: last?.createdAt ?? null,
      snippet: snippetOf(last?.text || (last?.attachment ? `[${last.attachment.type}]` : "")),
      canReply: true,
    }),
  };
}
