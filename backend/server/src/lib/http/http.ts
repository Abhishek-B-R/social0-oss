import { getRequestContext } from "../request-context.js";

/** Fastify-compatible request wrapper (Web Request + parsed URL). */
export class AppRequest extends Request {
  readonly parsedUrl: URL;

  constructor(input: string | URL, init?: RequestInit) {
    const href = typeof input === "string" ? input : input.toString();
    super(href, init);
    this.parsedUrl = new URL(href);
  }
}

type PendingResponse = {
  headers: Headers;
  finalize: () => void;
};

export class RouteResponse {
  static json(body: unknown, init?: { status?: number }) {
    const { reply } = getRequestContext();
    return reply.status(init?.status ?? 200).send(body);
  }

  /** JSON body with Set-Cookie headers copied from a Better Auth response. */
  static jsonWithCookies(
    body: unknown,
    cookieSource: Headers | Response,
    init?: { status?: number },
  ): PendingResponse {
    const headers = new Headers({ "content-type": "application/json" });
    const setCookies =
      cookieSource instanceof Response
        ? (cookieSource.headers.getSetCookie?.() ?? [])
        : (cookieSource.getSetCookie?.() ?? []);
    for (const cookie of setCookies) {
      headers.append("set-cookie", cookie);
    }
    const status = init?.status ?? 200;
    return {
      headers,
      finalize() {
        const { reply } = getRequestContext();
        for (const cookie of headers.getSetCookie?.() ?? []) {
          reply.header("set-cookie", cookie);
        }
        if (!reply.sent) reply.status(status).send(body);
      },
    };
  }

  static redirect(url: string | URL, status = 302): PendingResponse {
    const { reply } = getRequestContext();
    const target = typeof url === "string" ? url : url.toString();
    const headers = new Headers();
    return {
      headers,
      finalize() {
        for (const cookie of headers.getSetCookie?.() ?? []) {
          reply.header("set-cookie", cookie);
        }
        headers.forEach((value, key) => {
          if (key.toLowerCase() !== "set-cookie") {
            reply.header(key, value);
          }
        });
        if (!reply.sent) reply.redirect(target, status);
      },
    };
  }

  static error(status = 404): PendingResponse {
    const { reply } = getRequestContext();
    const headers = new Headers();
    return {
      headers,
      finalize() {
        if (!reply.sent) reply.status(status).send();
      },
    };
  }
}
