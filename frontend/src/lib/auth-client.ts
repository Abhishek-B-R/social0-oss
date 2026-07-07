import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { getAuthBaseUrl } from "@/lib/env";

export const authClient = createAuthClient({
  // OAuth + session API live on api.social0.app (not the SPA host).
  baseURL: getAuthBaseUrl(),
  plugins: [emailOTPClient()],
});

export const { signIn, signUp, signOut, useSession, updateUser } = authClient;
