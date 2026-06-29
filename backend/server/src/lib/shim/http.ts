import { getRequestContext } from "../request-context.js";

export class AppRequest extends Request {
  readonly nextUrl: URL;

  constructor(input: string | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : input.toString();
    super(url, init);
    this.nextUrl = new URL(url);
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
