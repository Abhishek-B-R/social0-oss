import { ensureAccounts } from "./helpers.js";
import { resolveAccountRefs } from "../utils/aliases.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accept a raw account UUID, the numeric alias from `social0 accounts`, or a
 * platform name. Only the numeric/platform forms need the accounts round-trip.
 */
export async function resolveAccountRef(ref: string): Promise<string> {
  const trimmed = ref.trim();
  if (UUID_RE.test(trimmed)) return trimmed;
  const aliases = await ensureAccounts();
  const ids = resolveAccountRefs([trimmed], aliases.map((a) => a.account));
  const id = ids[0];
  if (!id) {
    throw new Error(
      `No matching account for "${ref}". Run \`social0 accounts\` to see IDs.`,
    );
  }
  return id;
}
