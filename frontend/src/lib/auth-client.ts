import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { getAuthBaseUrl } from "@/lib/env";

export const authClient = createAuthClient({
  // OAuth + session API live on api.social0.app (not the SPA host).
  baseURL: getAuthBaseUrl(),
  plugins: [emailOTPClient()],
  // Focus refetch can briefly null the session on 401 blips and flash guest UI
  // ("signed out every few seconds"). Refetch on mount / explicit actions only.
  sessionOptions: {
    refetchOnWindowFocus: false,
  },
});

export const { signIn, signUp, signOut, useSession, updateUser } = authClient;
