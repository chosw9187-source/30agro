type ScopedItem = {
  teamId: string | null;
  assigneeId: string | null;
};

/**
 * An item applies to an evaluatee when:
 * - it has an assignee: only for that exact person (individual goals)
 * - otherwise, it has a team: only for that team's members
 * - otherwise: common, applies to everyone
 */
export function itemsForEvaluatee<T extends ScopedItem>(
  items: T[],
  evaluatee: { id: string; teamId: string | null }
): T[] {
  return items.filter((item) => {
    if (item.assigneeId) return item.assigneeId === evaluatee.id;
    if (item.teamId) return item.teamId === evaluatee.teamId;
    return true;
  });
}
