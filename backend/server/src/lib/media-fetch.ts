import { safeFetch } from "@social0/shared";
import {
  getAllowedMediaOrigins,
  isAllowedMediaUrl,
} from "./publish-validation.js";

export function assertAllowedMediaUrl(url: string): void {
  const allowed = getAllowedMediaOrigins();
  if (!allowed.appUrl || !isAllowedMediaUrl(url, allowed)) {
    throw new Error("Media URL is not on the allowed storage origin");
  }
}

export async function fetchAllowedMedia(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  assertAllowedMediaUrl(url);
  const httpsOnly = process.env.NODE_ENV === "production";
  const res = await safeFetch(url, { ...init, httpsOnly });
  if (!res?.ok) {
    throw new Error(`Failed to fetch media from storage: ${res?.status ?? "blocked"}`);
  }
  return res;
}
