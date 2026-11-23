/**
 * Connect-time SSRF guard for webhook delivery on the API droplet.
 *
 * The regression this pins: delivery only ran the string guard, which reads
 * hostname text. A webhook host registered while it resolved to a public IP
 * could be rebound to 127.0.0.1 / 10.x / 169.254.x, or 302 to a name that
 * resolves there, and `POST /v1/webhooks/:id/test` would connect and report
 * back the status, error and timing. The socket's own DNS lookup must refuse
 * those addresses, so nothing is ever dialled.
 */

import { EventEmitter } from "node:events";
import { Duplex, PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "@social0/shared";

const { dnsTable, httpMocks, mockDb } = vi.hoisted(() => ({
  /** hostname -> addresses the mocked resolver returns. */
  dnsTable: new Map<string, Array<{ address: string; family: number }>>(),
  httpMocks: {
    request: vi.fn(),
    actualRequest: (() => {
      throw new Error("node:http mock not initialised");
    }) as (...args: unknown[]) => unknown,
  },
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("node:dns", async (importActual) => {
  const actual = await importActual<typeof import("node:dns")>();
  const lookup = vi.fn(
    (
      hostname: string,
      _options: unknown,
      cb: (err: NodeJS.ErrnoException | null, addrs: unknown) => void,
    ) => {
      const hit = dnsTable.get(hostname);
      if (!hit) {
        const err: NodeJS.ErrnoException = new Error(
          `getaddrinfo ENOTFOUND ${hostname}`,
        );
        err.code = "ENOTFOUND";
        queueMicrotask(() => cb(err, []));
        return;
      }
      queueMicrotask(() => cb(null, hit));
    },
  );
  return { ...actual, default: { ...actual, lookup }, lookup };
});

vi.mock("node:http", async (importActual) => {
  const actual = await importActual<typeof import("node:http")>();
  httpMocks.actualRequest = actual.request as never;
  const request = (...args: unknown[]) => httpMocks.request(...args);
  return { ...actual, default: { ...actual, request }, request };
});

vi.mock("../db/index.js", () => ({ db: mockDb }));
vi.mock("@/db", () => ({ db: mockDb }));

function chain(result: unknown = []): unknown {
  const promise = Promise.resolve(result);
  const proxy: unknown = new Proxy(promise, {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return (target[prop as "then"] as (...a: unknown[]) => unknown).bind(
          target,
        );
      }
      return () => proxy;
    },
  });
  return proxy;
}

const PUBLIC_V4 = { address: "93.184.216.34", family: 4 };
const PUBLIC_V6 = { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 };

let globalFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  dnsTable.clear();
  httpMocks.request.mockReset();
  httpMocks.request.mockImplementation((...args: unknown[]) =>
    httpMocks.actualRequest(...args),
  );
  mockDb.select.mockImplementation(() => chain([]));
  mockDb.insert.mockImplementation(() => chain([]));
  mockDb.update.mockImplementation(() => chain([]));
  mockDb.execute.mockImplementation(() => Promise.resolve(undefined));
  // Delivery on Node must not fall back to the platform fetch.
  globalFetch = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", globalFetch);
  delete process.env.SOCIAL0_PUBLISH_WORKER;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type LookupResult = {
  err: NodeJS.ErrnoException | null;
  address: unknown;
  family?: number;
};

async function runLookup(
  hostname: string,
  options: { all?: boolean } = {},
): Promise<LookupResult> {
  const { publicOnlyLookup } = await import("../lib/public-address-fetch.js");
  return new Promise((resolve) => {
    publicOnlyLookup(hostname, options, (err, address, family) =>
      resolve({ err, address, family }),
    );
  });
}

describe("publicOnlyLookup", () => {
  it("passes a public address through in the shape net.connect asked for", async () => {
    dnsTable.set("hooks.example.com", [PUBLIC_V4, PUBLIC_V6]);

    const one = await runLookup("hooks.example.com");
    expect(one).toEqual({ err: null, address: PUBLIC_V4.address, family: 4 });

    const all = await runLookup("hooks.example.com", { all: true });
    expect(all.err).toBeNull();
    expect(all.address).toEqual([PUBLIC_V4, PUBLIC_V6]);
  });

  it.each([
    ["loopback", "127.0.0.1", 4],
    ["RFC1918", "10.0.0.5", 4],
    ["cloud metadata", "169.254.169.254", 4],
    ["IPv6 loopback", "::1", 6],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1", 6],
  ])("refuses a host that resolves to %s", async (_label, address, family) => {
    dnsTable.set("hook.attacker.example", [{ address, family }]);

    const { err } = await runLookup("hook.attacker.example", { all: true });
    expect(err?.code).toBe("ENONPUBLICADDRESS");
    // The resolved address is not echoed back to the caller.
    expect(err?.message).not.toContain(address);
  });

  it("refuses when any record is private, not only the first", async () => {
    dnsTable.set("mixed.example", [PUBLIC_V4, { address: "10.0.0.5", family: 4 }]);

    const { err } = await runLookup("mixed.example");
    expect(err?.code).toBe("ENONPUBLICADDRESS");
  });

  it("propagates resolver failures", async () => {
    const { err } = await runLookup("missing.example");
    expect(err?.code).toBe("ENOTFOUND");
  });
});

describe("publicAddressFetch", () => {
  it.each(["http", "https"])(
    "never connects over %s to a name that resolves to a private address",
    async (scheme) => {
      dnsTable.set("rebound.example", [{ address: "127.0.0.1", family: 4 }]);
      const { publicAddressFetch } = await import(
        "../lib/public-address-fetch.js"
      );

      // Real http/https stack: the lookup fails before any socket opens.
      await expect(
        publicAddressFetch(`${scheme}://rebound.example:8443/hook`, {
          method: "POST",
          body: "{}",
        }),
      ).rejects.toMatchObject({ code: "ENONPUBLICADDRESS" });
    },
  );

  it("sends the request with the guarded lookup and a fresh agent, and maps the response", async () => {
    dnsTable.set("hooks.example.com", [PUBLIC_V4]);
    const sent: { url?: URL; options?: Record<string, unknown>; body?: unknown } =
      {};
    let responseStream: PassThrough | undefined;

    httpMocks.request.mockImplementationOnce(
      (url: unknown, options: unknown, onResponse: unknown) => {
        const req = new EventEmitter() as EventEmitter & {
          end: (body?: unknown) => void;
        };
        req.end = (body) => {
          sent.url = url as URL;
          sent.options = options as Record<string, unknown>;
          sent.body = body;
          // Simulate net.connect: it resolves through the supplied lookup.
          const lookup = sent.options.lookup as (
            h: string,
            o: object,
            cb: (err: Error | null) => void,
          ) => void;
          lookup((url as URL).hostname, { all: true }, (err) => {
            if (err) {
              req.emit("error", err);
              return;
            }
            const res = Object.assign(new PassThrough(), {
              statusCode: 302,
              statusMessage: "Found",
              headers: { location: "/next", "set-cookie": ["a=b"] },
            });
            responseStream = res;
            (onResponse as (r: unknown) => void)(res);
            res.end("redirect body");
          });
        };
        return req;
      },
    );

    const { publicAddressFetch } = await import(
      "../lib/public-address-fetch.js"
    );
    const res = await publicAddressFetch("http://hooks.example.com/in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"ok":"é"}',
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/next");
    expect(res.body).toBeNull();
    // The body is never read: the response stream is closed, not drained.
    expect(responseStream?.destroyed).toBe(true);

    expect(sent.url?.href).toBe("http://hooks.example.com/in");
    expect(sent.body).toBe('{"ok":"é"}');
    const { publicOnlyLookup } = await import("../lib/public-address-fetch.js");
    expect(sent.options).toMatchObject({
      method: "POST",
      agent: false,
      lookup: publicOnlyLookup,
      headers: {
        "content-type": "application/json",
        // Byte length, not string length.
        "content-length": String(Buffer.byteLength('{"ok":"é"}')),
      },
    });
  });
});

/**
 * A fake socket that replays raw HTTP bytes to the real `node:http` client.
 * `onRequest` runs once the request has been written and gets the socket to
 * push response bytes into. Lets the real llhttp parser run without binding a
 * port.
 */
function fakeSocket(onRequest: (socket: Duplex) => void): Duplex {
  let answered = false;
  const socket = new Duplex({
    read() {},
    write(_chunk, _enc, cb) {
      if (!answered) {
        answered = true;
        queueMicrotask(() => onRequest(socket));
      }
      cb();
    },
  });
  return Object.assign(socket, {
    setNoDelay: () => socket,
    setKeepAlive: () => socket,
    setTimeout: () => socket,
    ref: () => socket,
    unref: () => socket,
    remoteAddress: PUBLIC_V4.address,
  });
}

/**
 * Route the next `http.request` through `socket` on the real http stack.
 * `agent: false` would build a fresh Agent that ignores `createConnection`,
 * so the override drops it; the production options are asserted above.
 */
function useFakeConnection(socket: Duplex): void {
  httpMocks.request.mockImplementationOnce(
    (url: unknown, options: unknown, onResponse: unknown) =>
      httpMocks.actualRequest(
        url,
        {
          ...(options as object),
          agent: undefined,
          createConnection: () => socket,
        },
        onResponse,
      ),
  );
}

describe("publicAddressFetch against hostile responses", () => {
  it("rejects instead of crashing on a reason phrase the Response constructor refuses", async () => {
    const uncaught = vi.fn();
    process.on("uncaughtException", uncaught);
    try {
      const socket = fakeSocket((s) => {
        // llhttp accepts 0x01 in the reason phrase; `new Response` does not.
        s.push("HTTP/1.1 200 O\x01K\r\nContent-Length: 0\r\n\r\n");
      });
      useFakeConnection(socket);
      const { publicAddressFetch } = await import(
        "../lib/public-address-fetch.js"
      );

      const res = await publicAddressFetch("http://hooks.example.com/in", {
        method: "POST",
        body: "{}",
      });

      // The status still reaches the caller; the bogus reason phrase is dropped.
      expect(res.status).toBe(200);
      expect(res.statusText).toBe("");
      expect(uncaught).not.toHaveBeenCalled();
    } finally {
      process.off("uncaughtException", uncaught);
    }
  });

  it("closes the connection once headers arrive when the body never ends", async () => {
    let chunksSent = 0;
    let streamer: ReturnType<typeof setInterval> | undefined;
    const socket = fakeSocket((s) => {
      s.push(
        "HTTP/1.1 500 Internal Server Error\r\nTransfer-Encoding: chunked\r\n\r\n",
      );
      streamer = setInterval(() => {
        if (s.destroyed) return;
        chunksSent++;
        s.push("5\r\nhello\r\n");
      }, 1);
    });
    useFakeConnection(socket);
    const { publicAddressFetch } = await import(
      "../lib/public-address-fetch.js"
    );

    try {
      const res = await publicAddressFetch("http://hooks.example.com/in", {
        method: "POST",
        body: "{}",
      });

      expect(res.status).toBe(500);
      // Nothing keeps the socket alive after the caller has its answer.
      await vi.waitFor(() => expect(socket.destroyed).toBe(true));
      const sentAtClose = chunksSent;
      await new Promise((r) => setTimeout(r, 20));
      expect(chunksSent).toBe(sentAtClose);
    } finally {
      clearInterval(streamer);
    }
  });
});

describe("webhook delivery on the API droplet", () => {
  const SUBSCRIPTION_ID = "22222222-2222-4222-8222-222222222222";

  it("refuses a webhook host rebound to a private address, without retrying or using fetch", async () => {
    dnsTable.set("hook.attacker.example", [{ address: "10.0.0.5", family: 4 }]);
    const { sendWebhookTestDelivery } = await import(
      "../lib/user-webhook-delivery.js"
    );

    const outcome = await sendWebhookTestDelivery({
      id: SUBSCRIPTION_ID,
      userId: "user_1",
      url: "https://hook.attacker.example/hook",
      secret: encryptToken("secret", SUBSCRIPTION_ID),
    });

    expect(outcome).toMatchObject({
      status: "failed",
      attempts: 1,
      responseStatus: null,
    });
    expect(outcome.error).toContain("not public");
    expect(globalFetch).not.toHaveBeenCalled();
  });
});
