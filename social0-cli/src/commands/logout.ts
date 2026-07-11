import { deleteApiKey } from "../config/credentials.js";
import { resetClient } from "../api/client.js";
import { success } from "../utils/output.js";

export async function logoutCommand(): Promise<void> {
  await deleteApiKey();
  resetClient();
  success("Logged out. API key removed from secure storage.");
}
