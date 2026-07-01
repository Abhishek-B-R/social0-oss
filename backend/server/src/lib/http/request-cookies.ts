import { getRequestContext } from "../request-context.js";

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  maxAge?: number;
  path?: string;
};

export async function headers(): Promise<Headers> {
  const { req } = getRequestContext();
  const h = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) h.append(key, v);
    } else {
      h.set(key, String(value));
    }
  }
  return h;
}

export async function cookies() {
  const { req, reply } = getRequestContext();
  return {
    get(name: string) {
      const val = req.cookies?.[name];
      return val ? { name, value: val } : undefined;
    },
    set(name: string, value: string, options?: CookieOptions) {
      reply.setCookie(name, value, {
        httpOnly: options?.httpOnly,
        secure: options?.secure,
        sameSite: options?.sameSite,
        maxAge: options?.maxAge,
        path: options?.path ?? "/",
      });
    },
    delete(name: string) {
      reply.clearCookie(name, { path: "/" });
    },
  };
}
