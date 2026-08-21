import { vemetric } from "@vemetric/react";

/** Public project token (safe in the browser). Override via VITE_VEMETRIC_TOKEN. */
export const VEMETRIC_TOKEN =
  import.meta.env.VITE_VEMETRIC_TOKEN?.trim() || "8ipSjTm12xRqFLWS";

export async function identifyVemetricUser(input: {
  id: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<void> {
  try {
    await vemetric.identify({
      identifier: input.id,
      ...(input.displayName?.trim()
        ? { displayName: input.displayName.trim() }
        : {}),
      ...(input.avatarUrl?.trim() ? { avatarUrl: input.avatarUrl.trim() } : {}),
    });
  } catch {
    // Analytics must never break the app.
  }
}

export async function resetVemetricUser(): Promise<void> {
  try {
    await vemetric.resetUser();
  } catch {
    // ignore
  }
}
