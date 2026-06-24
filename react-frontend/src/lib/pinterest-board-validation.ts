type PinterestAccountRef = {
  id: string;
  platformUsername?: string | null;
};

type PinterestSettingsRef = {
  boardId?: string;
};

/**
 * Returns a user-facing message when one or more Pinterest accounts have no board
 * selected, or null when all selected Pinterest accounts have a board.
 */
export function getPinterestBoardRequiredMessage(
  pinterestAccounts: PinterestAccountRef[],
  settingsByAccount: Record<string, PinterestSettingsRef | undefined>,
  action: "post" | "schedule" = "post",
): string | null {
  const missing = pinterestAccounts.filter(
    (acc) => !settingsByAccount[acc.id]?.boardId?.trim(),
  );
  if (missing.length === 0) return null;

  const verb = action === "schedule" ? "scheduling" : "posting";

  if (missing.length === 1) {
    const name = missing[0].platformUsername?.trim();
    if (name) {
      return `Select a Pinterest board for @${name} before ${verb}. Choose a board in Pinterest Config below.`;
    }
  }

  if (missing.length > 1) {
    return `Select a Pinterest board for each Pinterest account before ${verb} (${missing.length} missing). Open Pinterest Config and choose boards.`;
  }

  return `Select a Pinterest board before ${verb}. Open Pinterest Config below to choose a board.`;
}

export function hasMissingPinterestBoard(
  pinterestAccounts: PinterestAccountRef[],
  settingsByAccount: Record<string, PinterestSettingsRef | undefined>,
): boolean {
  return (
    getPinterestBoardRequiredMessage(pinterestAccounts, settingsByAccount) !==
    null
  );
}
