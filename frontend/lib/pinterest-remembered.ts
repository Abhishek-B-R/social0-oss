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
