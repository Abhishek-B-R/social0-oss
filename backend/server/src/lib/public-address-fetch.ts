/**
 * Node-only outbound HTTP that refuses to connect to a non-public address.
 *
 * `isSafeOutboundUrl` only reads the hostname text, so `hook.example.com`
 * passes it even when its A record is 127.0.0.1, and a name that resolved to a
 * public address when it was registered can be rebound to an internal one
 * later. The check here runs inside the socket's own DNS lookup: the address
 * that is vetted is the address that is dialled, on every request and every
 * redirect hop, so there is no window between "checked" and "connected".
 *
 * Do not import this statically from code the Cloudflare publish worker
 * loads: it needs `node:http`/`node:https`/`node:dns`, which the edge does not
 * provide. Load it with a dynamic `import()` behind a runtime check.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import {
  isPrivateOrResolvedAddress,
  NON_PUBLIC_ADDRESS_CODE,
} from "./ssrf-resolve.js";

export class NonPublicAddressError extends Error {
  readonly code = NON_PUBLIC_ADDRESS_CODE;
  constructor(hostname: string) {
    // The address itself is left out on purpose: echoing it back would let a
    // caller map the droplet's internal DNS through redirect targets.
    super(`Host ${hostname} resolves to an address that is not public.`);
    this.name = "NonPublicAddressError";
  }
}

/**
 * `net.connect` lookup that resolves the host and fails the connection when
 * any of its addresses is private, loopback, link-local or otherwise
 * non-public. One bad record is enough to refuse: with several A/AAAA records
 * the socket may dial whichever it likes (Happy Eyeballs), so all must be safe.
 */
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  const resolveOptions: LookupOptions = { ...options, all: true };
  dnsLookup(hostname, resolveOptions, (err, resolved) => {
    if (err) {
      callback(err, "");
      return;
    }
    const addresses = resolved as unknown as LookupAddress[];
    if (addresses.length === 0) {
      const notFound: NodeJS.ErrnoException = new Error(
        `getaddrinfo ENOTFOUND ${hostname}`,
      );
      notFound.code = "ENOTFOUND";
      callback(notFound, "");
      return;
    }
    if (addresses.some((a) => isPrivateOrResolvedAddress(a.address))) {
      callback(new NonPublicAddressError(hostname), "");
      return;
    }
    if (options.all) {
      callback(null, addresses);
      return;
    }
    const first = addresses[0]!;
    callback(null, first.address, first.family);
  });
};

function toNodeHeaders(init: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function toResponseHeaders(res: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    // Response headers are guarded: Set-Cookie would be dropped anyway.
    if (value === undefined || key === "set-cookie") continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      headers.append(key, v);
    }
  }
  return headers;
}

/**
 * Minimal `fetch` stand-in that connects only to public addresses.
 *
 * Deliberately narrow: string bodies only, redirects are never followed (the
 * caller sees the 3xx and decides, re-validating the next hop), a fresh agent
 * per request so no pooled socket that skipped this lookup is reused, and the
 * connection is closed as soon as the headers arrive — the returned `Response`
 * has a status and headers but no body (and no status text).
 */
export function publicAddressFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }

    const request =
      target.protocol === "https:"
        ? httpsRequest
        : target.protocol === "http:"
          ? httpRequest
          : null;
    if (!request) {
      reject(new TypeError(`Unsupported protocol ${target.protocol}`));
      return;
    }

    const body = init.body;
    if (body != null && typeof body !== "string") {
      reject(new TypeError("publicAddressFetch only sends string bodies."));
      return;
    }

    const headers = toNodeHeaders(init.headers);
    if (body != null) {
      headers["content-length"] = String(Buffer.byteLength(body));
    }

    const req = request(
      target,
      {
        method: init.method ?? "GET",
        headers,
        lookup: publicOnlyLookup,
        agent: false,
        signal: init.signal ?? undefined,
      },
      (res) => {
        // This runs from the socket's data event, outside the executor, so a
        // throw here would be an uncaughtException that takes the process
        // down. Every failure must become a rejection instead.
        res.on("error", () => undefined);
        try {
          const status = res.statusCode ?? 0;
          const responseHeaders = toResponseHeaders(res);
          // Nothing reads the body. Close the connection now rather than
          // draining it: an endpoint that streams forever (or sends gigabytes)
          // would otherwise hold this socket open long after the caller's
          // timeout is cleared. `agent: false` means no pooled socket is lost.
          res.destroy();
          if (status < 200 || status > 599) {
            reject(new Error(`Endpoint returned an invalid HTTP status (${status}).`));
            return;
          }
          // No statusText: the reason phrase is attacker-controlled, llhttp
          // accepts bytes (e.g. 0x01, 0x7F) that the Response constructor
          // rejects, and no caller reads it.
          resolve(new Response(null, { status, headers: responseHeaders }));
        } catch (err) {
          res.destroy();
          reject(err);
        }
      },
    );

    req.on("error", reject);
    req.end(body ?? undefined);
  });
}
