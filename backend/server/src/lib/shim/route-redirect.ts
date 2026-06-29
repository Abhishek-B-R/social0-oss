import { getRequestContext } from "../request-context.js";

const REDIRECT_DIGEST = "ROUTE_REDIRECT";

export function redirect(url: string | URL): never {
  const { reply } = getRequestContext();
  const target = typeof url === "string" ? url : url.toString();
  reply.redirect(target, 302);
  const err = new Error("ROUTE_REDIRECT") as Error & { digest?: string };
  err.digest = `${REDIRECT_DIGEST};${target}`;
  throw err;
}
