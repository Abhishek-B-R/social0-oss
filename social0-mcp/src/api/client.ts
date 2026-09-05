import { config } from "../config.js";
import { getRequestApiKey } from "../request-context.js";
import type { ApiErrorBody } from "../types/index.js";
import { logVerbose, parseRetryAfterMs, sleep } from "../utils/index.js";

export class Social0ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: ApiErrorBody | undefined;
  /** Seconds the server asked us to wait (429 only, from Retry-After). */
  readonly retryAfterSec: number | undefined;

  constructor(
    message: string,
    status: number,
    body?: ApiErrorBody,
    options?: { retryAfterSec?: number | undefined },
  ) {
    super(message);
    this.name = "Social0ApiError";
    this.status = status;
    this.code = extractErrorCode(body);
    this.body = body;
    this.retryAfterSec = options?.retryAfterSec;
  }

  /**
   * Model-facing text. A 429 must read as "wait N seconds", not as a generic
   * failure, or the host retries immediately and burns the same budget again.
   */
  toToolMessage(): string {
    if (this.status === 429) {
      const wait =
        this.retryAfterSec != null
          ? `Retry after ${this.retryAfterSec} seconds.`
          : "Wait about a minute before retrying.";
      return `Rate limited by Social0 (${this.message}). ${wait} Live analytics and inbox reads share a per-minute budget; do not retry in a loop.`;
    }
    return this.message;
  }
}

/** Whole seconds to wait per a Retry-After header, or undefined when absent. */
export function retryAfterSeconds(header: string | null): number | undefined {
  const ms = parseRetryAfterMs(header);
  if (ms == null || !Number.isFinite(ms)) return undefined;
  return Math.max(1, Math.ceil(ms / 1000));
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  idempotencyKey?: string;
}

function buildUrl(base: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/$/, "")}${normalizedPath}`;
}

async function parseJsonSafe(response: Response): Promise<ApiErrorBody | undefined> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as ApiErrorBody;
  } catch {
    return { error: text };
  }
}

function extractErrorCode(body: ApiErrorBody | undefined): string | undefined {
  if (!body) return undefined;
  if (typeof body.error === "object" && body.error?.code) return body.error.code;
  return body.code;
}

function errorMessage(body: ApiErrorBody | undefined, status: number): string {
  if (!body) return `HTTP ${status}`;
  if (typeof body.error === "object" && body.error?.message) return body.error.message;
  if (typeof body.error === "string") return body.error;
  if (body.message) return body.message;
  return `HTTP ${status}`;
}

export class Social0ApiClient {
  /** Optional explicit key. When omitted, resolve per request via ALS / env. */
  private readonly apiKeyOverride: string | undefined;

  constructor(apiKey?: string) {
    this.apiKeyOverride = apiKey;
  }

  /**
   * Must resolve at call time — the module-level `apiClient` singleton is
   * constructed at import (before hosted MCP sets AsyncLocalStorage).
   */
  private resolveApiKey(): string {
    return this.apiKeyOverride ?? getRequestApiKey();
  }

  async get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  async post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  async patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }

  async delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  async putRaw(url: string, body: Buffer, contentType: string, timeoutMs?: number): Promise<void> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body,
        signal: controller.signal,
      });

      logVerbose(`PUT ${url}`, { status: response.status, latencyMs: Date.now() - started });

      if (!response.ok) {
        throw new Social0ApiError(`Media upload failed with HTTP ${response.status}`, response.status);
      }
    } catch (error) {
      if (error instanceof Social0ApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new Social0ApiError("Media upload timed out", 408);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const url = buildUrl(config.v1Base, path);
    const apiKey = this.resolveApiKey();
    let attempt = 0;

    while (true) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? config.requestTimeoutMs,
      );

      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          ...options.headers,
        };

        if (options.idempotencyKey) {
          headers["Idempotency-Key"] = options.idempotencyKey;
        }

        const init: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (options.body !== undefined) {
          headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, init);
        const latencyMs = Date.now() - started;

        logVerbose(`${method} ${url}`, {
          status: response.status,
          latencyMs,
          attempt: attempt + 1,
        });

        if (response.status === 429 && attempt < config.maxRetries) {
          const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"));
          const backoff = retryAfter ?? Math.min(1000 * 2 ** attempt, 8000);
          attempt += 1;
          await sleep(backoff);
          continue;
        }

        if (!response.ok) {
          const body = await parseJsonSafe(response);
          throw new Social0ApiError(
            errorMessage(body, response.status),
            response.status,
            body,
            response.status === 429
              ? { retryAfterSec: retryAfterSeconds(response.headers.get("retry-after")) }
              : undefined,
          );
        }

        if (response.status === 204) {
          return undefined as T;
        }

        const text = await response.text();
        if (!text) {
          return undefined as T;
        }

        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof Social0ApiError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          throw new Social0ApiError(`Request timed out: ${method} ${path}`, 408);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

export function getApiClient(): Social0ApiClient {
  return new Social0ApiClient();
}

/** @deprecated Prefer getApiClient() for request-scoped credentials. */
export const apiClient = getApiClient();
