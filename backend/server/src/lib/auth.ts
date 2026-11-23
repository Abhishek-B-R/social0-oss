import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { db } from "../db/index.js";
import { getCorsOrigins } from "./app-url.js";
import { env, getAuthApiBaseUrl } from "./env.js";
import { sendEmail } from "./mail.js";
import { user, session, account, verification } from "../db/schema.js";

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
  // Google sign-in keeps Better Auth's signed `state` cookie check on: the DB
  // row alone proves the state exists, not that *this browser* started the
  // flow, so skipping the cookie lets an attacker hand a victim their own
  // callback URL and log them into the attacker's account (login CSRF). The
  // SPA and API are same-site (*.social0.app, cookie domain social0.app,
  // SameSite=None; Secure), so the cookie set on the sign-in POST does reach
  // the callback.
  advanced: {
    // X-Forwarded-For is rewritten to the proxy-resolved client address by the
    // root onRequest hook (lib/client-ip.ts) before it gets here, so the
    // limiter keys on an address the client cannot choose.
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
    },
    useSecureCookies: authBaseUrl.startsWith("https://"),
    crossSubDomainCookies: {
      enabled: authBaseUrl.includes("social0.app"),
      domain: "social0.app",
    },
    ...(authBaseUrl.startsWith("https://")
      ? { defaultCookieAttributes: { sameSite: "none" as const } }
      : {}),
  },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      // OTP is for verifying email and resetting passwords only. Without this,
      // sign-in-by-OTP creates a verified user for any address (skipping the
      // /api/auth/sign-up wrapper's limiter, Turnstile and legal acceptance)
      // and send-verification-otp {type:"sign-in"} mails codes to strangers.
      // routes/api/auth.ts also refuses both OTP sign-in requests outright.
      disableSignUp: true,
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
    // A reset is how a user locks out someone holding a stolen session.
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    autoSignInAfterVerification: true,
  },
  // OAuth state + OTP verifications live in Postgres only (never Upstash).
  // secondaryStorage sent verifications to Redis; timeouts/eviction caused state_mismatch.
  verification: {
    storeInDatabase: true,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectURI: `${authBaseUrl}/api/auth/callback/google`,
    },
  },
  session: {
    storeSessionInDatabase: true,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: "jwe" as const,
    },
  },
  rateLimit: {
    storage: "memory",
  },
});
