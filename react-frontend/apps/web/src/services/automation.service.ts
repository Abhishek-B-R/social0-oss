import { apiGet, apiPost } from "@/lib/api-client";

export const automationService = {
  // Backend v1 / dedicated routes TBD — structure for resurface + autoplug
  createResurface(input: Record<string, unknown>): Promise<{ id: string }> {
    return apiPost("/v1/automations/resurface", input);
  },

  createAutoPlug(input: Record<string, unknown>): Promise<{ id: string }> {
    return apiPost("/v1/automations/autoplug", input);
  },
};

export const settingsService = {
  get(): Promise<Record<string, unknown>> {
    return apiGet("/v1/settings");
  },

  update(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return apiPost("/v1/settings", input);
  },
};

export const feedbackService = {
  cannySsoToken(): Promise<{ token: string }> {
    return apiGet("/api/canny/sso");
  },
};

export const apiKeysService = {
  list(): Promise<{ keys: Array<{ id: string; name: string; keyPrefix: string }> }> {
    return apiGet("/api/api-keys");
  },

  create(name: string): Promise<{ key: string; apiKey: { id: string } }> {
    return apiPost("/api/api-keys", { name });
  },

  revoke(id: string): Promise<void> {
    return import("@/lib/api-client").then((m) => m.apiDelete(`/api/api-keys/${id}`));
  },
};
