import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config.js";

type RequestStore = {
  apiKey: string;
};

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function getRequestApiKey(): string {
  const store = requestContext.getStore();
  if (store?.apiKey) return store.apiKey;
  return config.apiKey;
}

export function runWithApiKey<T>(apiKey: string, fn: () => T): T {
  return requestContext.run({ apiKey }, fn);
}

export async function runWithApiKeyAsync<T>(
  apiKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContext.run({ apiKey }, fn);
}
