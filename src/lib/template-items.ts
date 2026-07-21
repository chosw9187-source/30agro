export function itemsForTeam<T extends { teamId: string | null }>(
  items: T[],
  teamId: string | null
): T[] {
  return items.filter((item) => item.teamId === null || item.teamId === teamId);
}
