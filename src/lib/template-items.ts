type ScopedItem = {
  teamId: string | null;
  assigneeId: string | null;
  team?: { leaderId: string | null } | null;
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
      if (item.teamId) {
        return (
          item.teamId === evaluatee.teamId || item.team?.leaderId === evaluatee.id
        );
      }
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
 * for context, when itemsForEvaluatee() includes it for visibility).
 * - An item with an individual assignee (개인목표) is scored only for that
 *   person — everyone else on the team just sees it.
 * - A team-wide item with no assignee (팀목표) is scored only for the
 *   team's leader, who is accountable for the team-level outcome — regular
 *   members see it but are not scored on it.
 */
export function isScorableFor<
  T extends { assigneeId: string | null; team?: { leaderId: string | null } | null }
>(item: T, evaluatee: { id: string }): boolean {
  if (item.assigneeId) return item.assigneeId === evaluatee.id;
  return item.team?.leaderId === evaluatee.id;
}
