import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { db } from "@/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mail";
import { user, session, account, verification } from "@/db/schema";

const subjects: Record<string, string> = {
  "sign-in": "Your Social0 sign-in code",
  "email-verification": "Verify your Social0 email",
  "forget-password": "Your Social0 password reset code",
};

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
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
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
      // Better Auth maps Google profile (name, email, image) to the user record by default on sign-in.
    },
  },
});
