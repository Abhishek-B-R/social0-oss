import { Resend } from "resend";
import { env } from "./env.js";

const resend = new Resend(env.RESEND_API_KEY);

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  return resend.emails.send({
    from: env.RESEND_FROM_EMAIL ?? "Social0 <noreply@social0.app>",
    to,
    subject,
    html,
  });
}
