import { config } from "../config.js";
import type { ApiErrorBody } from "../types/index.js";
import { logVerbose, parseRetryAfterMs, sleep } from "../utils/index.js";

export class Social0ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: ApiErrorBody | undefined;

  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message);
    this.name = "Social0ApiError";
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }

  get isNotImplemented(): boolean {
    return this.code === "NOT_IMPLEMENTED" || this.status === 501;
  }

  toToolMessage(): string {
    if (this.isNotImplemented) {
      return `Social0 API endpoint not yet available (${this.message}). This feature is coming soon to the public REST API.`;
    }
    return this.message;
  }
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
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

function errorMessage(body: ApiErrorBody | undefined, status: number): string {
  if (!body) return `HTTP ${status}`;
  if (typeof body.error === "string") return body.error;
  if (body.message) return body.message;
  if (body.route) return `${body.route} is not implemented`;
  return `HTTP ${status}`;
}

export class Social0ApiClient {
  private readonly apiKey: string;

  constructor(apiKey: string = config.apiKey) {
    this.apiKey = apiKey;
  }

  async get<T>(base: string, path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(base, path, { ...options, method: "GET" });
  }

  async post<T>(base: string, path: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(base, path, { ...options, method: "POST", body });
  }

  async patch<T>(base: string, path: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(base, path, { ...options, method: "PATCH", body });
  }

  async delete<T>(base: string, path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(base, path, { ...options, method: "DELETE" });
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

  private async request<T>(base: string, path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const url = buildUrl(base, path);
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
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          ...options.headers,
        };

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

export const apiClient = new Social0ApiClient();
