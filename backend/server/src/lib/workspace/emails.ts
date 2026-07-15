import { sendEmail } from "../mail.js";
import { appUrlForPath } from "../app-url.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendWorkspaceInviteEmail(opts: {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  token: string;
}): Promise<void> {
  const inviteUrl = appUrlForPath(`/invite/${opts.token}`);
  const workspace = escapeHtml(opts.workspaceName);
  const inviter = escapeHtml(opts.inviterName);
  const role = escapeHtml(opts.role);

  await sendEmail({
    to: opts.to,
    subject: `${opts.inviterName} invited you to ${opts.workspaceName} on Social0`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">You’re invited to collaborate</h2>
        <p><strong>${inviter}</strong> invited you to join <strong>${workspace}</strong> as a <strong>${role}</strong>.</p>
        <p>You’ll be able to create and schedule posts using the workspace’s connected accounts — no separate Pro subscription required.</p>
        <p style="margin:24px 0">
          <a href="${inviteUrl}" style="background:#059669;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">
            Accept invitation
          </a>
        </p>
        <p style="color:#666;font-size:13px">This invite expires in 7 days. If you didn’t expect this, you can ignore this email.</p>
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
