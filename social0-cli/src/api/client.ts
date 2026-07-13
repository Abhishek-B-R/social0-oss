import { getApiKey } from "../config/credentials.js";
import { resolveApiUrl, getRequestTimeoutMs, getMaxRetries } from "../config/settings.js";
import type { ApiErrorBody } from "../types/index.js";
import { logVerbose, parseRetryAfterMs, sleep, redactUrlForLog } from "../utils/verbose.js";

export class Social0ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: ApiErrorBody | undefined;

  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message);
    this.name = "Social0ApiError";
    this.status = status;
    this.code = extractErrorCode(body);
    this.body = body;
  }
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  idempotencyKey?: string;
  apiUrl?: string;
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
  private apiKey: string | null = null;
  private apiUrl: string;

  constructor(apiUrl?: string) {
    this.apiUrl = resolveApiUrl(apiUrl);
  }

  async init(): Promise<void> {
    this.apiKey = await getApiKey();
    if (!this.apiKey) {
      throw new Social0ApiError(
        "Not authenticated. Run `social0 login` to set your API key.",
        401,
      );
    }
  }

  setApiKey(key: string): void {
    this.apiKey = key;
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
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? getRequestTimeoutMs());

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body,
        signal: controller.signal,
      });

      logVerbose(`PUT ${redactUrlForLog(url)}`, { status: response.status, latencyMs: Date.now() - started });

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
    if (!this.apiKey) await this.init();

    const method = options.method ?? "GET";
    const base = resolveApiUrl(options.apiUrl ?? this.apiUrl);
    const url = buildUrl(base, path);
    let attempt = 0;
    const maxRetries = getMaxRetries();

    while (true) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? getRequestTimeoutMs(),
      );

      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.apiKey}`,
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

        logVerbose(`${method} ${redactUrlForLog(url)}`, {
          status: response.status,
          latencyMs,
          attempt: attempt + 1,
        });

        if (response.status === 429 && attempt < maxRetries) {
          const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"));
          const backoff = retryAfter ?? Math.min(1000 * 2 ** attempt, 8000);
          attempt += 1;
          logVerbose(`Rate limited, retrying in ${backoff}ms`);
          await sleep(backoff);
          continue;
        }

        if (!response.ok) {
          const body = await parseJsonSafe(response);
          throw new Social0ApiError(errorMessage(body, response.status), response.status, body);
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

let defaultClient: Social0ApiClient | null = null;

export function getClient(apiUrl?: string): Social0ApiClient {
  if (!defaultClient || apiUrl) {
    defaultClient = new Social0ApiClient(apiUrl);
  }
  return defaultClient;
}

export function resetClient(): void {
  defaultClient = null;
}
