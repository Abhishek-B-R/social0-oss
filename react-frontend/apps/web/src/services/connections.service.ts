import { apiPost } from "@/lib/api-client";
import type { Platform } from "@/lib/platforms";
import { getApiBaseUrl } from "@/lib/env";

export const connectionsService = {
  connectUrl(platform: Platform): string {
    return `${getApiBaseUrl()}/api/connect/${platform}`;
  },

  reauthUrl(platform: Platform): string {
    return `${getApiBaseUrl()}/api/connect/${platform}/reauth`;
  },

  blueskyByok(input: {
    handle: string;
    appPassword: string;
  }): Promise<{ ok: boolean }> {
    return apiPost("/api/connect/bluesky/byok", input);
  },

  selectFacebookPage(input: {
    accountId: string;
    pageId: string;
  }): Promise<{ ok: boolean }> {
    return apiPost("/api/connect/facebook/select", input);
  },

  selectInstagramPage(input: {
    accountId: string;
    pageId: string;
  }): Promise<{ ok: boolean }> {
    return apiPost("/api/connect/instagram-facebook/select", input);
  },

  selectLinkedInOrg(input: {
    accountId: string;
    organizationId: string;
  }): Promise<{ ok: boolean }> {
    return apiPost("/api/connect/linkedin/select", input);
  },

  refreshTwitterPremium(): Promise<{ ok: boolean }> {
    return apiPost("/api/connect/refresh-twitter-premium");
  },

  refreshTokens(platform: Platform): Promise<{ jobId: string }> {
    return apiPost("/api/connect/refresh-tokens", { platform });
  },
};
