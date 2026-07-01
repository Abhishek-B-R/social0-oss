declare module "@sentry/node" {
  import type { FastifyInstance } from "fastify";

  export interface SentryInitOptions {
    dsn?: string;
    environment?: string;
    tracesSampleRate?: number;
  }

  export function init(options: SentryInitOptions): void;
  export function setupFastifyErrorHandler(app: FastifyInstance): void;

  export const logger: {
    info: (message: string, context?: Record<string, unknown>) => void;
  };
}
