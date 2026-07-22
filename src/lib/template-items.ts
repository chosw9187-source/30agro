type ScopedItem = {
  teamId: string | null;
  assigneeId: string | null;
};

/**
 * Which items an evaluatee sees at all.
 * Performance (KPI/goal) items are visible to the whole team once scoped to
 * that team, even goals owned by a teammate — everyone sees the team's full
 * goal list for context, but see isScorableFor() for who actually gets
 * evaluated on each one. Competency items keep individual > team > common
 * precedence since those are always meant for one audience only.
 */
export function itemsForEvaluatee<T extends ScopedItem>(
  items: T[],
  evaluatee: { id: string; teamId: string | null },
  kind: "COMPETENCY" | "PERFORMANCE"
): T[] {
  if (kind === "PERFORMANCE") {
    return items.filter((item) => {
      if (item.teamId) return item.teamId === evaluatee.teamId;
      if (item.assigneeId) return item.assigneeId === evaluatee.id;
      return true;
    });
  }
  return items.filter((item) => {
    if (item.assigneeId) return item.assigneeId === evaluatee.id;
    if (item.teamId) return item.teamId === evaluatee.teamId;
    return true;
  });
}

/**
 * Whether an evaluatee is actually scored on this item (vs. just seeing it
 * for context). An item assigned to a specific teammate is view-only for
 * everyone else on the team.
 */
export function isScorableFor<T extends { assigneeId: string | null }>(
  item: T,
  evaluatee: { id: string }
): boolean {
  return !item.assigneeId || item.assigneeId === evaluatee.id;
}
