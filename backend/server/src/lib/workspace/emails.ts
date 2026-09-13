import { escapeHtml } from "@social0/shared";
import { sendEmail } from "../mail.js";
import { appUrlForPath } from "../app-url.js";

export async function sendWorkspaceInviteEmail(opts: {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
}): Promise<void> {
  const signInUrl = appUrlForPath(
    `/auth?callbackUrl=${encodeURIComponent("/dashboard")}`,
  );
  const workspace = escapeHtml(opts.workspaceName);
  const inviter = escapeHtml(opts.inviterName);
  const role = escapeHtml(opts.role);

  await sendEmail({
    to: opts.to,
    subject: `${opts.inviterName} invited you to ${opts.workspaceName} on Social0`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px">
        <p style="margin:0 0 16px">Hey there!</p>
        <p style="margin:0 0 16px">
          <strong>${inviter}</strong> has invited you to join
          <strong>${workspace}</strong> on Social0 as a
          <strong>${role}</strong>.
        </p>
        <p style="margin:0 0 20px">Sign in to your account to accept the invitation.</p>
        <p style="margin:0 0 20px">
          <a href="${signInUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">
            Sign In to Social0
          </a>
        </p>
        <p style="margin:0 0 12px;color:#444">
          Once you&apos;re in, you&apos;ll see the invitation at the top of your dashboard.
        </p>
        <p style="margin:0;color:#666;font-size:13px">
          If you have any questions, just reply to this email.
        </p>
      </div>
    `,
  });
}

export async function sendWorkspaceMemberRemovedEmail(opts: {
  to: string;
  workspaceName: string;
}): Promise<void> {
  const workspace = escapeHtml(opts.workspaceName);
  await sendEmail({
    to: opts.to,
    subject: `You’ve been removed from ${opts.workspaceName}`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;line-height:1.5;color:#111">
        <p>Your access to <strong>${workspace}</strong> on Social0 has been removed.</p>
        <p style="color:#666;font-size:13px">If you think this was a mistake, ask a workspace admin to invite you again.</p>
      </div>
    `,
  });
}

export async function sendWorkspaceRoleChangedEmail(opts: {
  to: string;
  workspaceName: string;
  role: string;
}): Promise<void> {
  const workspace = escapeHtml(opts.workspaceName);
  const role = escapeHtml(opts.role);
  await sendEmail({
    to: opts.to,
    subject: `Your role in ${opts.workspaceName} was updated`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;line-height:1.5;color:#111">
        <p>Your role in <strong>${workspace}</strong> is now <strong>${role}</strong>.</p>
      </div>
    `,
  });
}

export async function sendWorkspaceInviteAcceptedEmail(opts: {
  to: string;
  workspaceName: string;
  memberName: string;
  memberEmail: string;
}): Promise<void> {
  const workspace = escapeHtml(opts.workspaceName);
  const member = escapeHtml(opts.memberName || opts.memberEmail);
  await sendEmail({
    to: opts.to,
    subject: `${opts.memberName || opts.memberEmail} joined ${opts.workspaceName}`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;line-height:1.5;color:#111">
        <p><strong>${member}</strong> accepted the invite and joined <strong>${workspace}</strong>.</p>
      </div>
    `,
  });
}
