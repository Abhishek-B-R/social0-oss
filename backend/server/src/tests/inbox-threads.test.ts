import { describe, expect, it } from "vitest";
import {
  instagramProfilePicUrl,
  isInboxSelfActor,
  isWeakDmPeerName,
  mergeDmThreadIdentity,
  missingDmScopes,
  missingInboxScopes,
  peerFromParticipants,
  instagramDmPeer,
  instagramDmSendRecipient,
  instagramDmWithinReplyWindow,
  instagramSelfIgsid,
  reconnectScopesFromFetch,
  toInboxThreads,
  youtubeAuthorChannelId,
  sameLinkedInActor,
  type InboxComment,
  type InboxDmThread,
} from "../lib/inbox/types.js";

function comment(partial: Partial<InboxComment> & Pick<InboxComment, "id">): InboxComment {
  return {
    platform: "instagram",
    accountId: "acc",
    accountLabel: "me",
    postId: "post",
    publicationId: "pub",
    platformPostId: "media",
    platformPostUrl: null,
    postSnippet: "hello",
    postContent: "hello",
    authorName: "Ada",
    authorHandle: "ada",
    text: "hi",
    createdAt: "2026-01-02T00:00:00.000Z",
    parentId: null,
    canReply: true,
    ...partial,
  };
}

describe("missingInboxScopes", () => {
  it("does not nag when stored scopes are unknown (empty/null)", () => {
    expect(missingInboxScopes("instagram", null)).toEqual([]);
    expect(missingInboxScopes("facebook", "")).toEqual([]);
    expect(missingInboxScopes("youtube", "")).toEqual([]);
  });

  it("flags scopes explicitly missing from a non-empty grant string", () => {
    expect(missingInboxScopes("instagram", "instagram_business_basic")).toEqual([
      "instagram_business_manage_comments",
    ]);
    expect(missingInboxScopes("facebook", "pages_read_engagement")).toEqual([
      "pages_manage_engagement",
    ]);
  });

  it("does not nag platforms that need no extra scopes", () => {
    expect(missingInboxScopes("twitter_x", null)).toEqual([]);
  });

  it("requires youtube.force-ssl when grant is present but incomplete", () => {
    expect(
      missingInboxScopes(
        "youtube",
        "https://www.googleapis.com/auth/youtube.readonly",
      ),
    ).toEqual(["https://www.googleapis.com/auth/youtube.force-ssl"]);
    expect(
      missingInboxScopes(
        "youtube",
        "https://www.googleapis.com/auth/youtube.force-ssl",
      ),
    ).toEqual([]);
  });

  it("matches Google short scope names against full auth URLs", () => {
    expect(
      missingInboxScopes("youtube", "youtube.force-ssl youtube.readonly"),
    ).toEqual([]);
  });
});

describe("reconnectScopesFromFetch", () => {
  it("ignores DB-style missing after a successful fetch", () => {
    expect(reconnectScopesFromFetch({ status: "ok" })).toEqual([]);
    expect(
      reconnectScopesFromFetch({
        status: "scope_missing",
        missingScopes: ["threads_manage_replies"],
      }),
    ).toEqual(["threads_manage_replies"]);
  });
});

describe("missingDmScopes", () => {
  it("does not nag when stored scopes are unknown", () => {
    expect(missingDmScopes("instagram", null)).toEqual([]);
    expect(missingDmScopes("facebook", "")).toEqual([]);
  });

  it("does not nag Instagram for DM scopes (DMs disabled)", () => {
    expect(missingDmScopes("instagram", "instagram_business_basic")).toEqual([]);
  });

  it("does not nag X, Bluesky, or TikTok for extra OAuth strings", () => {
    expect(missingDmScopes("twitter_x", null)).toEqual([]);
    expect(missingDmScopes("bluesky", "")).toEqual([]);
    expect(missingDmScopes("tiktok", null)).toEqual([]);
  });
});

describe("instagramProfilePicUrl", () => {
  it("reads profile_pic from User Profile API payloads", () => {
    expect(
      instagramProfilePicUrl({
        profile_pic: "https://fbcdn-profile.example/avatar.jpg",
      }),
    ).toBe("https://fbcdn-profile.example/avatar.jpg");
    expect(instagramProfilePicUrl({ profile_pic: null })).toBeNull();
    expect(instagramProfilePicUrl({})).toBeNull();
  });
});

describe("isInboxSelfActor", () => {
  it("matches by id or username when Instagram ids diverge", () => {
    expect(
      isInboxSelfActor({ id: "ig-me", username: "henry" }, "ig-me", "henry"),
    ).toBe(true);
    expect(
      isInboxSelfActor(
        { id: "different-messaging-id", username: "henry__polymath" },
        "ig-me",
        "henry__polymath",
      ),
    ).toBe(true);
    expect(
      isInboxSelfActor({ id: "peer", username: "tester" }, "ig-me", "henry"),
    ).toBe(false);
  });

  it("matches the messaging IGSID even when /me and username are missing", () => {
    expect(
      isInboxSelfActor(
        { id: "msg-self", username: undefined },
        "graph-me-id",
        "henry__polymath",
        "msg-self",
      ),
    ).toBe(true);
  });
});

describe("peerFromParticipants", () => {
  it("picks the other person, not the connected account", () => {
    const peer = peerFromParticipants(
      [
        { id: "page", name: "My Page" },
        { id: "user-1", name: "Ada", username: "ada" },
      ],
      "page",
    );
    expect(peer).toEqual({
      id: "user-1",
      name: "Ada",
      handle: "ada",
      avatarUrl: null,
    });
  });

  it("excludes self by username when messaging id ≠ /me id", () => {
    const peer = peerFromParticipants(
      [
        { id: "msg-self", username: "henry__polymath", name: "Henry" },
        { id: "igsid-tester", username: "testersocial8", name: "tester" },
      ],
      "graph-me-id",
      "henry__polymath",
    );
    expect(peer).toEqual({
      id: "igsid-tester",
      name: "tester",
      handle: "testersocial8",
      avatarUrl: null,
    });
  });

  it("does not fall back to self when no other participant", () => {
    const peer = peerFromParticipants(
      [{ id: "page", name: "My Page" }],
      "page",
    );
    expect(peer.id).toBe("");
  });
});

describe("instagramDmPeer", () => {
  it("uses the inbound sender IGSID even when /me id differs", () => {
    const peer = instagramDmPeer(
      [
        { id: "msg-self", username: undefined, name: "Henry" },
        { id: "igsid-tester", username: "testersocial8", name: "tester" },
      ],
      "graph-me-id",
      "henry__polymath",
      { id: "igsid-tester", username: "testersocial8", name: "tester" },
    );
    expect(peer.id).toBe("igsid-tester");
    expect(peer.handle).toBe("testersocial8");
  });

  it("picks the other participant when the last message is from us", () => {
    const peer = instagramDmPeer(
      [
        { id: "msg-self", username: "henry__polymath", name: "Henry" },
        { id: "igsid-tester", username: "testersocial8", name: "tester" },
      ],
      "graph-me-id",
      "henry__polymath",
      { id: "msg-self", username: "henry__polymath", name: "Henry" },
    );
    expect(peer.id).toBe("igsid-tester");
  });

  it("does not treat our last message as the customer when from has no username", () => {
    const profiles = new Map([
      ["msg-self", { username: "henry__polymath", name: "Henry" }],
      ["igsid-tester", { username: "testersocial8", name: "tester" }],
    ]);
    const self = instagramSelfIgsid(
      [
        { id: "msg-self" },
        { id: "igsid-tester" },
      ],
      "graph-me-id",
      "henry__polymath",
      profiles,
    );
    expect(self).toBe("msg-self");
    const peer = instagramDmPeer(
      [
        { id: "msg-self" },
        { id: "igsid-tester" },
      ],
      "graph-me-id",
      "henry__polymath",
      { id: "msg-self" },
      profiles,
    );
    expect(peer.id).toBe("igsid-tester");
    expect(peer.handle).toBe("testersocial8");
  });
});

describe("instagramDmSendRecipient", () => {
  it("prefers the latest inbound author id over thread peer id", () => {
    expect(
      instagramDmSendRecipient(
        [
          { isOwn: false, authorId: "customer-igsid" },
          { isOwn: true, authorId: "msg-self" },
        ],
        {
          threadPeerId: "wrong-peer",
          fallbackPeerId: "also-wrong",
          selfId: "graph-me-id",
          selfUsername: "henry__polymath",
          selfIgsid: "msg-self",
        },
      ),
    ).toBe("customer-igsid");
  });

  it("rejects candidates that resolve to our messaging id", () => {
    expect(
      instagramDmSendRecipient(
        [{ isOwn: true, authorId: "msg-self" }],
        {
          threadPeerId: "msg-self",
          fallbackPeerId: "msg-self",
          selfId: "graph-me-id",
          selfUsername: "henry__polymath",
          selfIgsid: "msg-self",
        },
      ),
    ).toBeNull();
  });
});

describe("instagramDmWithinReplyWindow", () => {
  it("is true when the customer messaged within 24 hours", () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(
      instagramDmWithinReplyWindow([
        { isOwn: false, createdAt: recent },
        { isOwn: true, createdAt: new Date().toISOString() },
      ]),
    ).toBe(true);
  });

  it("is false when the last inbound message is older than 24 hours", () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(
      instagramDmWithinReplyWindow([{ isOwn: false, createdAt: old }]),
    ).toBe(false);
  });
});

describe("mergeDmThreadIdentity", () => {
  const base = {
    conversationId: "c1",
    platform: "twitter_x",
    accountId: "acc",
    accountLabel: "me",
    peerId: "p1",
    lastMessageAt: null,
    snippet: "hi",
    canReply: true,
  } satisfies Omit<InboxDmThread, "peerName" | "peerHandle" | "peerAvatarUrl">;

  it("keeps richer list identity over weak thread placeholders", () => {
    const list: InboxDmThread = {
      ...base,
      peerName: "Ada Lovelace",
      peerHandle: "ada",
      peerAvatarUrl: "https://cdn.example/ada.jpg",
    };
    const thread: InboxDmThread = {
      ...base,
      peerName: "X user",
      peerHandle: null,
      peerAvatarUrl: null,
    };
    expect(mergeDmThreadIdentity(thread, list)).toMatchObject({
      peerName: "Ada Lovelace",
      peerHandle: "ada",
      peerAvatarUrl: "https://cdn.example/ada.jpg",
    });
  });

  it("detects weak placeholder names", () => {
    expect(isWeakDmPeerName("X user")).toBe(true);
    expect(isWeakDmPeerName("Ada")).toBe(false);
  });
});

describe("toInboxThreads", () => {
  it("nests replies and keeps orphans as top-level", () => {
    const threads = toInboxThreads([
      comment({
        id: "child",
        parentId: "parent",
        text: "reply",
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
      comment({
        id: "parent",
        text: "top",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      comment({
        id: "orphan",
        parentId: "missing",
        text: "lost parent",
        createdAt: "2026-01-04T00:00:00.000Z",
      }),
    ]);
    expect(threads.map((t) => t.comment.id)).toEqual(["orphan", "parent"]);
    expect(threads[1]?.replies.map((r) => r.id)).toEqual(["child"]);
  });

  it("flattens reply-to-reply under the conversation root", () => {
    const threads = toInboxThreads([
      comment({ id: "root", createdAt: "2026-01-01T00:00:00.000Z" }),
      comment({
        id: "r1",
        parentId: "root",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
      comment({
        id: "r2",
        parentId: "r1",
        text: "your reply",
        isOwn: true,
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.replies.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("youtubeAuthorChannelId", () => {
  it("unwraps { value } and ignores empty", () => {
    expect(youtubeAuthorChannelId({ value: "UC123" })).toBe("UC123");
    expect(youtubeAuthorChannelId("UC123")).toBe("UC123");
    expect(youtubeAuthorChannelId({ value: "" })).toBeNull();
    expect(youtubeAuthorChannelId(null)).toBeNull();
  });
});

describe("sameLinkedInActor", () => {
  it("matches person URN to bare id and org URN to itself", () => {
    expect(sameLinkedInActor("urn:li:person:abc", "abc")).toBe(true);
    expect(
      sameLinkedInActor("urn:li:organization:99", "urn:li:organization:99"),
    ).toBe(true);
    expect(sameLinkedInActor("urn:li:person:abc", "other")).toBe(false);
    expect(sameLinkedInActor(null, "abc")).toBe(false);
  });
});
