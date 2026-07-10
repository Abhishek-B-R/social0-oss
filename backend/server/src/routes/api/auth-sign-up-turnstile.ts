import { signUpDev } from "./auth-sign-up.js";

/** Back-compat alias — same handler as /api/auth/sign-up. */
export async function signUpWithTurnstile(request: Request) {
  return signUpDev(request);
}
