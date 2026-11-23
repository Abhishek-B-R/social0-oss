import type { WorkspaceRole } from "@/lib/workspace-roles";

/** What each role can do, in one line. Shown in the role picker and invite dialog. */
export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  admin: "Everything except billing: accounts, members, posting schedule, posts and inbox.",
  member: "Create, schedule and publish posts. Reply in the inbox. See analytics.",
  community: "Reply to comments and DMs in the inbox. Can see posts, but can't publish or schedule.",
  analyst: "See analytics and posts. Can't publish, schedule or reply.",
};
