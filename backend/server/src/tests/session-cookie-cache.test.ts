import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("../lib/auth.js", () => ({ auth: { api: { getSession } } }));

const { getSessionFromRequest, getRouteSession, sessionReadMustBypassCookieCache } =
  await import("../lib/session.js");
const { runWithRequestContext } = await import("../lib/request-context.js");
type RequestContext = Parameters<typeof runWithRequestContext>[0];

function inRoute<T>(method: string, fn: () => Promise<T>): Promise<T> {
  const req = { method, headers: { cookie: "better-auth.session_token=t" } };
  return runWithRequestContext(
    { req, reply: {} } as unknown as RequestContext,
    fn,
  );
}

describe("getSessionFromRequest cookie cache", () => {
  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue(null);
  });

  it("checks Postgres for state-changing requests", async () => {
    // A revoked session's JWE cookie cache stays valid for its maxAge; a POST
    // (mint an API key, any RPC) must not be authorized from it.
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      getSession.mockClear();
      await getSessionFromRequest({
        method,
        headers: { cookie: "better-auth.session_token=t" },
      });
      expect(getSession).toHaveBeenCalledWith(
        expect.objectContaining({ query: { disableCookieCache: true } }),
      );
    }
  });

  it("lets reads use the cookie cache", async () => {
    await getSessionFromRequest({ method: "GET", headers: { cookie: "x=1" } });
    const arg = getSession.mock.calls[0]?.[0] as { query?: unknown };
    expect(arg.query).toBeUndefined();
    expect((arg as { headers: Headers }).headers.get("cookie")).toBe("x=1");
  });

  it("only treats GET, HEAD and OPTIONS as safe", () => {
    expect(sessionReadMustBypassCookieCache("GET")).toBe(false);
    expect(sessionReadMustBypassCookieCache("HEAD")).toBe(false);
    expect(sessionReadMustBypassCookieCache("OPTIONS")).toBe(false);
    expect(sessionReadMustBypassCookieCache("POST")).toBe(true);
    expect(sessionReadMustBypassCookieCache("DELETE")).toBe(true);
  });
});

describe("getRouteSession (REST handlers run through runRouteHandler)", () => {
  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue(null);
  });

  it("checks Postgres for state-changing routes", async () => {
    // POST /api/pinterest/boards, PUT /api/pinterest/default-board,
    // POST/PATCH/DELETE /api/queue/slots, connect selects, legal accept: a
    // session revoked by "Sign out all devices" must not keep writing from
    // its cached session_data cookie.
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      getSession.mockClear();
      await inRoute(method, () => getRouteSession());
      expect(getSession).toHaveBeenCalledWith(
        expect.objectContaining({ query: { disableCookieCache: true } }),
      );
      const arg = getSession.mock.calls[0]?.[0] as { headers: Headers };
      expect(arg.headers.get("cookie")).toBe("better-auth.session_token=t");
    }
  });

  it("lets GET routes use the cookie cache", async () => {
    await inRoute("GET", () => getRouteSession());
    const arg = getSession.mock.calls[0]?.[0] as { query?: unknown };
    expect(arg.query).toBeUndefined();
  });
});
