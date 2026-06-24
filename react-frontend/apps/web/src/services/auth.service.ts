import { apiGet, apiPost } from "@/lib/api-client";

export const authService = {
  checkEmail(email: string): Promise<{ exists: boolean; hasPassword: boolean }> {
    return apiGet(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
  },

  signUp(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<{ ok: boolean }> {
    return apiPost("/api/auth/sign-up", input);
  },

  signUpWithTurnstile(input: {
    email: string;
    password: string;
    name: string;
    turnstileToken: string;
  }): Promise<{ ok: boolean }> {
    return apiPost("/api/auth/sign-up-with-turnstile", input);
  },

  sendChangeEmailOtp(email: string): Promise<{ ok: boolean }> {
    return apiPost("/api/account/change-email/send-otp", { email });
  },

  changeEmail(input: { email: string; otp: string }): Promise<{ ok: boolean }> {
    return apiPost("/api/account/change-email", input);
  },
};
