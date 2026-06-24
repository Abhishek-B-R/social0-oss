export function getRememberedBoard(accountId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(`pinterest-board-${accountId}`);
  } catch {
    return null;
  }
}

export function setRememberedBoard(accountId: string, boardId: string): void {
  try {
    localStorage.setItem(`pinterest-board-${accountId}`, boardId);
  } catch {
    // ignore
  }
}

/** Persist default Pinterest board to the database so it is pre-selected next time. */
export async function savePinterestDefaultBoardToDb(
  accountId: string,
  boardId: string,
): Promise<void> {
  try {
    const res = await fetch("/api/pinterest/default-board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, boardId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Failed to save");
    }
  } catch {
    // Non-blocking: UI still updated via onChange
  }
}

export function getRememberedLink(accountId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(`pinterest-link-${accountId}`);
  } catch {
    return null;
  }
}

export function setRememberedLink(accountId: string, link: string): void {
  try {
    localStorage.setItem(`pinterest-link-${accountId}`, link);
  } catch {
    // ignore
  }
}
