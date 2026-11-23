import { describe, expect, it } from "vitest";
import type { IGetHttpRequestArgs } from "twitter-api-v2";
import {
  X_REQUEST_TIMEOUT_MS,
  classifyXError,
  createXUserClient,
  requestTimeoutPlugin,
} from "../lib/x-client.js";

type ConfigHookArgs = Parameters<
  NonNullable<ReturnType<typeof requestTimeoutPlugin>["onBeforeRequestConfig"]>
>[0];

function hookArgs(params: Partial<IGetHttpRequestArgs>): ConfigHookArgs {
  return { params: params as IGetHttpRequestArgs } as ConfigHookArgs;
}

/**
 * twitter-api-v2 arms a timeout only when the request carries one, and none of
 * its convenience methods do. A stalled socket then held the cron's scheduler
 * slot (and every scheduled post behind it) until the process restarted.
 */
describe("requestTimeoutPlugin", () => {
  it("gives a request without a timeout one", () => {
    const args = hookArgs({ url: "https://api.x.com/2/tweets/1", method: "GET" });
    requestTimeoutPlugin(1234).onBeforeRequestConfig?.(args);
    expect(args.params.timeout).toBe(1234);
  });

  it("leaves an explicit timeout alone", () => {
    const args = hookArgs({ url: "https://api.x.com/2/tweets", method: "POST", timeout: 99 });
    requestTimeoutPlugin(1234).onBeforeRequestConfig?.(args);
    expect(args.params.timeout).toBe(99);
  });

  it("is installed on the cron client", () => {
    const client = createXUserClient({
      appKey: "k",
      appSecret: "s",
      accessToken: "t",
      accessSecret: "ts",
    });
    const plugins = (client as unknown as { getPlugins(): unknown[] }).getPlugins();
    expect(plugins).toHaveLength(1);
    const args = hookArgs({ url: "https://api.x.com/2/tweets/1", method: "GET" });
    (plugins![0] as ReturnType<typeof requestTimeoutPlugin>).onBeforeRequestConfig?.(args);
    expect(args.params.timeout).toBe(X_REQUEST_TIMEOUT_MS);
  });
});

describe("classifyXError", () => {
  it("tells rate limits, server errors and missing responses from refusals", () => {
    expect(classifyXError({ type: "response", code: 429 })).toBe("rate_limited");
    expect(classifyXError({ type: "response", code: 503 })).toBe("server_error");
    expect(classifyXError({ type: "response", code: 408 })).toBe("server_error");
    expect(classifyXError({ type: "request" })).toBe("no_response");
    expect(classifyXError({ type: "partial-response" })).toBe("no_response");
    expect(classifyXError({ type: "response", code: 401 })).toBe("permanent");
    expect(classifyXError({ type: "response", code: 404 })).toBe("permanent");
    expect(classifyXError(new Error("db down"))).toBe("permanent");
  });
});
