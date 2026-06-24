import type { PublishContext, PublishResult } from "../types.js";

function stub(platform: string) {
  return async (ctx: PublishContext): Promise<PublishResult> => {
    console.info(
      `[worker] STUB ${platform} publish post=${ctx.postId} account=${ctx.connectedAccountId}`,
    );
    if (process.env.WORKER_STUB_FAIL === "1") {
      return { success: false, error: `${platform} stub failure` };
    }
    return {
      success: true,
      platformPostId: `stub-${platform}-${Date.now()}`,
      platformUrl: `https://example.com/${platform}/stub`,
    };
  };
}

export const publishLinkedIn = stub("linkedin");
export const publishFacebook = stub("facebook");
export const publishInstagram = stub("instagram");
export const publishYouTube = stub("youtube");
export const publishPinterest = stub("pinterest");
export const publishTikTok = stub("tiktok");
export const publishTwitter = stub("twitter");
export const publishThreads = stub("threads");
export const publishBluesky = stub("bluesky");
