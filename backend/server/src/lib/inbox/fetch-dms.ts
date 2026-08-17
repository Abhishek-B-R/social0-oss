/**
 * Live DM fetchers. Failures degrade — never throw past the dispatcher.
 * Instagram, Facebook Pages, X, Bluesky only (platforms with a public messaging API).
 */

import { TwitterApi } from "twitter-api-v2";
import { env } from "../env.js";
import { inDateWindow } from "../date-window.js";
import {
  peerFromParticipants,
  type InboxDmMessage,
  type InboxDmThread,
} from "./types.js";

export type DmAccount = {
  id: string;
  platform: string;
  platformUserId: string;
  platformUsername: string | null;
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

type GraphPerson = { id?: string; name?: string; username?: string };

async function jsonGet(
  url: string,
  headers?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
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
    case "facebook":
      return fetchFacebookList(account, since, until);
    case "instagram":
      return fetchInstagramList(account, since, until);
    case "twitter_x":
      return fetchTwitterList(account, since, until);
    case "bluesky":
      return fetchBlueskyList(account, since, until);
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
    case "facebook":
      return fetchFacebookThread(account, conversationId);
    case "instagram":
      return fetchInstagramThread(account, conversationId);
    case "twitter_x":
      return fetchTwitterThread(account, conversationId, peerId);
    case "bluesky":
      return fetchBlueskyThread(account, conversationId);
    default:
      return { messages: [], status: "unsupported" };
  }
}

function isMessagingPermissionError(msg: string): boolean {
  return /permission|#200|#10|pages_messaging|manage_messages|messaging/i.test(
    msg,
  );
}

async function fetchFacebookList(
  account: DmAccount,
  since: Date,
  until: Date,
): Promise<DmListFetchResult> {
  const id = encodeURIComponent(account.platformUserId);
  const fields =
    "id,updated_time,snippet,participants{id,name,username},messages.limit(1){message,created_time,from}";
  const url = `https://graph.facebook.com/v21.0/${id}/conversations?fields=${encodeURIComponent(fields)}&limit=25&access_token=${encodeURIComponent(account.accessToken)}`;
  const { ok, data } = await jsonGet(url);
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "Facebook DMs failed";
    return graphErr(
      msg,
      isMessagingPermissionError(msg) ? ["pages_messaging"] : undefined,
    );
  }
  const rows = (data as { data?: Array<Record<string, unknown>> })?.data ?? [];
  const threads: InboxDmThread[] = [];
  for (const row of rows) {
    const updated =
      typeof row.updated_time === "string" ? row.updated_time : null;
    if (!inDateWindow(updated, since, until)) continue;
    const peer = peerFromParticipants(
      graphPeople(row.participants),
      account.platformUserId,
    );
    const last =
      (row.messages as { data?: Array<{ message?: string }> } | undefined)
        ?.data?.[0];
    threads.push({
      conversationId: String(row.id ?? ""),
      platform: "facebook",
      accountId: account.id,
      accountLabel: account.platformUsername,
      peerId: peer.id,
      peerName: peer.name,
      peerHandle: peer.handle,
      lastMessageAt: updated,
      snippet: snippetOf(
        typeof row.snippet === "string" ? row.snippet : last?.message,
      ),
      canReply: Boolean(peer.id),
    });
  }
  return { threads, status: "ok" };
}

async function fetchInstagramList(
  account: DmAccount,
  since: Date,
  until: Date,
): Promise<DmListFetchResult> {
  const id = encodeURIComponent(account.platformUserId);
  const fields =
    "id,updated_time,participants{id,username,name},messages.limit(1){message,created_time,from}";
  const url = `https://graph.instagram.com/v21.0/${id}/conversations?platform=instagram&fields=${encodeURIComponent(fields)}&limit=25&access_token=${encodeURIComponent(account.accessToken)}`;
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
  const rows = (data as { data?: Array<Record<string, unknown>> })?.data ?? [];
  const threads: InboxDmThread[] = [];
  for (const row of rows) {
    const updated =
      typeof row.updated_time === "string" ? row.updated_time : null;
    if (!inDateWindow(updated, since, until)) continue;
    const peer = peerFromParticipants(
      graphPeople(row.participants),
      account.platformUserId,
    );
    const last =
      (row.messages as { data?: Array<{ message?: string }> } | undefined)
        ?.data?.[0];
    threads.push({
      conversationId: String(row.id ?? ""),
      platform: "instagram",
      accountId: account.id,
      accountLabel: account.platformUsername,
      peerId: peer.id,
      peerName: peer.name,
      peerHandle: peer.handle,
      lastMessageAt: updated,
      snippet: snippetOf(last?.message),
      canReply: Boolean(peer.id),
    });
  }
  return { threads, status: "ok" };
}

function graphMessagesToInbox(
  rows: Array<Record<string, unknown>>,
  account: DmAccount,
): InboxDmMessage[] {
  const out: InboxDmMessage[] = [];
  for (const row of rows) {
    const from = row.from as GraphPerson | undefined;
    const isOwn = Boolean(from?.id && from.id === account.platformUserId);
    out.push({
      id: String(row.id ?? ""),
      text: String(row.message ?? ""),
      createdAt:
        typeof row.created_time === "string" ? row.created_time : null,
      isOwn,
      authorName: isOwn
        ? "You"
        : (from?.name ?? from?.username ?? "Unknown"),
      authorHandle: from?.username ?? from?.id ?? null,
    });
  }
  out.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  return out;
}

async function fetchFacebookThread(
  account: DmAccount,
  conversationId: string,
): Promise<DmThreadFetchResult> {
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(conversationId)}?fields=id,updated_time,participants{id,name,username},messages.limit(50){id,created_time,from,message}&access_token=${encodeURIComponent(account.accessToken)}`;
  const { ok, data } = await jsonGet(url);
  if (!ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      "Facebook thread failed";
    return graphMsg(
      msg,
      isMessagingPermissionError(msg) ? ["pages_messaging"] : undefined,
    );
  }
  const row = data as Record<string, unknown>;
  const peer = peerFromParticipants(
    graphPeople(row.participants),
    account.platformUserId,
  );
  const msgs =
    (row.messages as { data?: Array<Record<string, unknown>> } | undefined)
      ?.data ?? [];
  const messages = graphMessagesToInbox(msgs, account);
  const last = messages[messages.length - 1];
  return {
    messages,
    status: "ok",
    thread: {
      conversationId,
      platform: "facebook",
      accountId: account.id,
      accountLabel: account.platformUsername,
      peerId: peer.id,
      peerName: peer.name,
      peerHandle: peer.handle,
      lastMessageAt: last?.createdAt ?? (typeof row.updated_time === "string" ? row.updated_time : null),
      snippet: snippetOf(last?.text),
      canReply: Boolean(peer.id),
    },
  };
}

async function fetchInstagramThread(
  account: DmAccount,
  conversationId: string,
): Promise<DmThreadFetchResult> {
  const url = `https://graph.instagram.com/v21.0/${encodeURIComponent(conversationId)}?fields=id,updated_time,participants{id,username,name},messages.limit(50){id,created_time,from,message}&access_token=${encodeURIComponent(account.accessToken)}`;
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
  const peer = peerFromParticipants(
    graphPeople(row.participants),
    account.platformUserId,
  );
  const msgs =
    (row.messages as { data?: Array<Record<string, unknown>> } | undefined)
      ?.data ?? [];
  const messages = graphMessagesToInbox(msgs, account);
  const last = messages[messages.length - 1];
  return {
    messages,
    status: "ok",
    thread: {
      conversationId,
      platform: "instagram",
      accountId: account.id,
      accountLabel: account.platformUsername,
      peerId: peer.id,
      peerName: peer.name,
      peerHandle: peer.handle,
      lastMessageAt: last?.createdAt ?? (typeof row.updated_time === "string" ? row.updated_time : null),
      snippet: snippetOf(last?.text),
      canReply: Boolean(peer.id),
    },
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
};

type XUser = { id: string; name?: string; username?: string };

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
    const raw = await client.v2.get("dm_events", {
      max_results: 100,
      event_types: "MessageCreate",
      "dm_event.fields":
        "id,text,event_type,dm_conversation_id,created_at,sender_id,participant_ids",
      expansions: "sender_id,participant_ids",
      "user.fields": "name,username",
    });
    const events = ((raw as { data?: XDmEvent[] }).data ?? []).filter(
      (e) => e.event_type === "MessageCreate" || !e.event_type,
    );
    const users = new Map<string, XUser>();
    for (const u of (raw as { includes?: { users?: XUser[] } }).includes?.users ?? []) {
      users.set(u.id, u);
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
      if (!inDateWindow(last?.created_at ?? null, since, until)) continue;
      const participantIds = new Set<string>();
      for (const ev of list) {
        for (const pid of ev.participant_ids ?? []) participantIds.add(pid);
        if (ev.sender_id) participantIds.add(ev.sender_id);
      }
      participantIds.delete(account.platformUserId);
      const peerId = [...participantIds][0] ?? "";
      const peer = peerId ? users.get(peerId) : undefined;
      threads.push({
        conversationId,
        platform: "twitter_x",
        accountId: account.id,
        accountLabel: account.platformUsername,
        peerId,
        peerName: peer?.name ?? peer?.username ?? "X user",
        peerHandle: peer?.username ?? null,
        lastMessageAt: last?.created_at ?? null,
        snippet: snippetOf(last?.text),
        canReply: Boolean(peerId),
      });
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
    const raw = await client.v2.get(
      `dm_conversations/${encodeURIComponent(conversationId)}/dm_events`,
      {
        max_results: 50,
        event_types: "MessageCreate",
        "dm_event.fields":
          "id,text,event_type,dm_conversation_id,created_at,sender_id",
        expansions: "sender_id",
        "user.fields": "name,username",
      },
    );
    const events = ((raw as { data?: XDmEvent[] }).data ?? []).filter(
      (e) => e.event_type === "MessageCreate" || !e.event_type,
    );
    const users = new Map<string, XUser>();
    for (const u of (raw as { includes?: { users?: XUser[] } }).includes?.users ?? []) {
      users.set(u.id, u);
    }
    events.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    const messages: InboxDmMessage[] = events.map((ev) => {
      const isOwn = ev.sender_id === account.platformUserId;
      const user = ev.sender_id ? users.get(ev.sender_id) : undefined;
      return {
        id: String(ev.id ?? ""),
        text: ev.text ?? "",
        createdAt: ev.created_at ?? null,
        isOwn,
        authorName: isOwn ? "You" : (user?.name ?? user?.username ?? "X user"),
        authorHandle: user?.username ?? null,
      };
    });
    const last = messages[messages.length - 1];
    const peer = peerId ? users.get(peerId) : undefined;
    return {
      messages,
      status: "ok",
      thread: {
        conversationId,
        platform: "twitter_x",
        accountId: account.id,
        accountLabel: account.platformUsername,
        peerId,
        peerName: peer?.name ?? peer?.username ?? "X user",
        peerHandle: peer?.username ?? null,
        lastMessageAt: last?.createdAt ?? null,
        snippet: snippetOf(last?.text),
        canReply: Boolean(peerId),
      },
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

async function blueskySession(
  handle: string,
  appPassword: string,
): Promise<{ accessJwt: string; did: string } | null> {
  const res = await fetch(
    "https://bsky.social/xrpc/com.atproto.server.createSession",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    accessJwt?: string;
    did?: string;
  };
  if (!res.ok || !data.accessJwt || !data.did) return null;
  return { accessJwt: data.accessJwt, did: data.did };
}

async function blueskyChat(
  jwt: string,
  nsid: string,
  opts?: { method?: "GET" | "POST"; params?: Record<string, string>; body?: unknown },
): Promise<{ ok: boolean; data: unknown }> {
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
  return { ok: res.ok, data };
}

type BskyMember = { did?: string; handle?: string; displayName?: string };
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
  const appPassword = account.accessSecret;
  if (!handle || !appPassword) {
    return graphErr("Bluesky credentials incomplete. Reconnect the account.");
  }
  const session = await blueskySession(handle, appPassword);
  if (!session) {
    return graphErr("Bluesky login failed. Reconnect the account.");
  }
  const { ok, data } = await blueskyChat(session.accessJwt, "chat.bsky.convo.listConvos", {
    params: { limit: "30" },
  });
  if (!ok) {
    const msg =
      (data as { message?: string })?.message ?? "Bluesky chat failed";
    return graphErr(msg);
  }
  const convos = (data as { convos?: BskyConvo[] }).convos ?? [];
  const threads: InboxDmThread[] = [];
  for (const convo of convos) {
    if (!convo.id) continue;
    const sentAt = convo.lastMessage?.sentAt ?? null;
    if (!inDateWindow(sentAt, since, until)) continue;
    const peer = bskyPeer(convo.members, session.did);
    threads.push({
      conversationId: convo.id,
      platform: "bluesky",
      accountId: account.id,
      accountLabel: account.platformUsername,
      peerId: peer.did ?? "",
      peerName: peer.displayName ?? peer.handle ?? "Bluesky user",
      peerHandle: peer.handle ?? null,
      lastMessageAt: sentAt,
      snippet: snippetOf(convo.lastMessage?.text),
      canReply: true,
    });
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
  const appPassword = account.accessSecret;
  if (!handle || !appPassword) {
    return graphMsg("Bluesky credentials incomplete. Reconnect the account.");
  }
  const session = await blueskySession(handle, appPassword);
  if (!session) {
    return graphMsg("Bluesky login failed. Reconnect the account.");
  }
  const [msgsRes, convoRes] = await Promise.all([
    blueskyChat(session.accessJwt, "chat.bsky.convo.getMessages", {
      params: { convoId: conversationId, limit: "50" },
    }),
    blueskyChat(session.accessJwt, "chat.bsky.convo.getConvo", {
      params: { convoId: conversationId },
    }),
  ]);
  if (!msgsRes.ok) {
    const msg =
      (msgsRes.data as { message?: string })?.message ?? "Bluesky thread failed";
    return graphMsg(msg);
  }
  const peer = bskyPeer(
    (convoRes.data as { convo?: BskyConvo })?.convo?.members,
    session.did,
  );
  const rows = (msgsRes.data as { messages?: BskyChatMessage[] }).messages ?? [];
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
      };
    })
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const last = messages[messages.length - 1];
  return {
    messages,
    status: "ok",
    thread: {
      conversationId,
      platform: "bluesky",
      accountId: account.id,
      accountLabel: account.platformUsername,
      peerId: peer.did ?? "",
      peerName: peer.displayName ?? peer.handle ?? "Bluesky user",
      peerHandle: peer.handle ?? null,
      lastMessageAt: last?.createdAt ?? null,
      snippet: snippetOf(last?.text),
      canReply: true,
    },
  };
}
