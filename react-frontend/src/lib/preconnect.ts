/**
 * Pre-connect messages shown before OAuth for each platform.
 * Used by ConnectPlatformButton.
 */
export const PRE_CONNECT: Record<
  string,
  { title: string; checkmark: string; info: string }
> = {
  linkedin: {
    title: "Connect LinkedIn",
    checkmark: "Be signed in to the account you want to connect",
    info: "Connect your LinkedIn profile to share content and manage your professional presence.\n\nBefore connecting:\nMake sure you are signed in to the LinkedIn Profile account you wish to connect. You may need to sign out and sign in to connect multiple accounts.",
  },
  facebook: {
    title: "Connect Facebook Page",
    checkmark: "Must be a Page",
    info: "Social0 only supports connecting Facebook Pages. Personal profiles and Groups are not supported.",
  },
  youtube: {
    title: "Connect YouTube",
    checkmark: "Must have a YouTube channel",
    info: "Connect to a YouTube account to upload and schedule YouTube Shorts.\n\nRequirements:\n• Google account must be associated with a YouTube channel\n• You can revoke our access to your data at any time through the Google security settings page.",
  },
  pinterest: {
    title: "Connect Pinterest Account",
    checkmark: "Be signed into your Pinterest account",
    info: "Be signed into your Pinterest account that you want to connect.",
  },
  tiktok: {
    title: "Connect TikTok",
    checkmark: "Must be a Business or Creator profile",
    info: "Connect a TikTok Creator or Business profile to schedule posts, manage comments and more.\n\nRequirements:\n• Must be a Business or Creator profile\n• Account must be older than 48 hours\n\nTikTok does not support logging in to multiple accounts at once on web. To connect multiple accounts:\n1. Log in to the account you wish to connect (same browser)\n2. Press Connect below\n3. Log out and log in to the other account\n4. Connect again - repeat for each account.",
  },
  twitter_x: {
    title: "Connect Twitter",
    checkmark: "Be signed in to the account you want to connect",
    info: "Connect a Twitter Profile to schedule posts and more.\n\nBefore connecting:\nMake sure you are signed in to the Twitter/X account you wish to connect. You may need to switch accounts before authenticating.",
  },
  threads: {
    title: "Connect Threads",
    checkmark: "Must have an Instagram account",
    info: "Connect your Threads account to post and schedule content on Threads.\n\nRequirements:\n• You must have an Instagram account to use Threads. Your Threads account is automatically linked to your Instagram account.\n• Create a Threads account if you haven't already.",
  },
  instagram: {
    title: "Connect Instagram",
    checkmark: "Must be a Business or Creator account",
    info: "Personal Instagram accounts are not supported. Your account must be connected to a Facebook Page.",
  },
};
