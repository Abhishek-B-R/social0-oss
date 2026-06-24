import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { getAppUrl } from "@/lib/env";

export const authClient = createAuthClient({
  // Same as Next.js: auth API is reached at the SPA origin (/api proxied to backend).
  baseURL: getAppUrl(),
  plugins: [emailOTPClient()],
});

export const { signIn, signUp, signOut, useSession, updateUser } = authClient;
