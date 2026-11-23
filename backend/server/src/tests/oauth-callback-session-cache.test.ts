import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OAuth callbacks are GETs, but they insert or overwrite connected accounts.
 * A session revoked by "Sign out all devices" or a password reset must not
 * bind an account from its still-valid `session_data` cookie cache.
 */

const getSession = vi.fn();
vi.mock("../lib/auth.js", () => ({ auth: { api: { getSession } } }));
vi.mock("../lib/http/request-cookies.js", () => ({
  headers: async () => new Headers({ cookie: "from-context=1" }),
}));
vi.mock("../lib/oauth-connect-binding.js", () => ({
  clearOAuthConnectBinding: vi.fn(),
  verifyOAuthConnectBinding: vi.fn().mockResolvedValue(false),
}));
vi.mock("../lib/workspace/context.js", () => ({
  resolveWorkspaceContext: vi.fn(),
}));
vi.mock("../lib/redirect.js", () => ({ safeRedirect: vi.fn() }));

const { readCallbackSession } = await import("../lib/oauth-callback-session.js");

describe("readCallbackSession", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("reads a live session row, never the cookie cache", async () => {
    getSession.mockResolvedValue({ user: { id: "user_1" } });
    const session = await readCallbackSession(
      new Request("http://localhost/api/connect/x/callback", {
        headers: { cookie: "better-auth.session_token=t" },
      }),
    );
    expect(session?.user.id).toBe("user_1");
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true } }),
    );
  });

  it("falls back to the request-context headers, still uncached", async () => {
    getSession.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const session = await readCallbackSession(
      new Request("http://localhost/api/connect/x/callback"),
    );
    expect(session).toBeNull();
    expect(getSession).toHaveBeenCalledTimes(2);
    for (const [arg] of getSession.mock.calls) {
      expect(arg).toEqual(
        expect.objectContaining({ query: { disableCookieCache: true } }),
      );
    }
    const second = getSession.mock.calls[1]?.[0] as { headers: Headers };
    expect(second.headers.get("cookie")).toBe("from-context=1");
  });
});
