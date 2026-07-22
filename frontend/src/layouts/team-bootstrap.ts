/** Survives layout remounts so in-team navigations don't flash the gate. */
const bootstrappedTeams = new Set<string>();

export function hasTeamBootstrap(teamId: string): boolean {
  return bootstrappedTeams.has(teamId);
}

export function markTeamBootstrapped(teamId: string): void {
  bootstrappedTeams.add(teamId);
}

export function unmarkTeamBootstrapped(teamId: string): void {
  bootstrappedTeams.delete(teamId);
}

/** Call when deliberately leaving a team URL tree (e.g. switcher → Main). */
export function clearTeamBootstrap(teamId?: string | null) {
  if (teamId) {
    bootstrappedTeams.delete(teamId);
    return;
  }
  bootstrappedTeams.clear();
}
