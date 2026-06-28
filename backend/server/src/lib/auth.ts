import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { db } from "../db/index.js";
import { createAuthSecondaryStorage } from "./auth-secondary-storage.js";
import { getCorsOrigins } from "./app-url.js";
import { env, getAuthApiBaseUrl } from "./env.js";
import { sendEmail } from "./mail.js";
import { redis } from "./redis.js";
import { user, session, account, verification } from "../db/schema.js";

const secondaryStorage = createAuthSecondaryStorage(redis);

const subjects: Record<string, string> = {
  "sign-in": "Your Social0 sign-in code",
  "email-verification": "Verify your Social0 email",
  "forget-password": "Your Social0 password reset code",
};

const authBaseUrl = getAuthApiBaseUrl();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  baseURL: authBaseUrl,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: getCorsOrigins(),
  advanced: {
    useSecureCookies: authBaseUrl.startsWith("https://"),
    crossSubDomainCookies: {
      enabled: authBaseUrl.includes("social0.app"),
      domain: "social0.app",
    },
  },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        await sendEmail({
          to: email,
          subject: subjects[type] ?? "Your Social0 verification code",
          html: `
          <div style="font-family:sans-serif;max-width:400px;margin:0 auto">
            <h2>Your verification code</h2>
            <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#10b981">${otp}</p>
            <p>This code expires in 10 minutes. Do not share it with anyone.</p>
          </div>
        `,
        });
      },
      otpLength: 6,
      expiresIn: 600,
    }),
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    autoSignInAfterVerification: true,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectURI: `${authBaseUrl}/api/auth/callback/google`,
    },
  },
  secondaryStorage,
  session: {
    storeSessionInDatabase: true,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: "jwe" as const,
    },
  },
  rateLimit: {
    storage: "secondary-storage" as const,
  },
});
