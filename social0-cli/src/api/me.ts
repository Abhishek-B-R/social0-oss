import type { MeResponse } from "../types/index.js";
import { getClient } from "./client.js";

export async function getMe(): Promise<MeResponse> {
  return getClient().get<MeResponse>("/me");
}
