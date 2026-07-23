import { gradePoints } from "@/lib/grade";

export type PerformanceItemComparison = {
  id: string;
  category: string;
  label: string;
  description: string | null;
  currentLevel: string | null;
  targetLevel: string | null;
  weight: number;
  selfGrade: string | null;
  managerGrade: string | null;
  selfPoints: number | null;
  managerPoints: number | null;
};

type TemplateItemLike = {
  id: string;
  category: string;
  label: string;
  description: string | null;
  currentLevel: string | null;
  targetLevel: string | null;
  weight: number | null;
};

type ScoreLike = {
  grade: string | null;
  selfGrade: string | null;
};

export function buildPerformanceComparison(
  items: TemplateItemLike[],
  scoreByItem: Map<string, ScoreLike>
): PerformanceItemComparison[] {
  return items.map((item) => {
    const s = scoreByItem.get(item.id);
    const selfGrade = s?.selfGrade ?? null;
    const managerGrade = s?.grade ?? null;
    return {
      id: item.id,
      category: item.category,
      label: item.label,
      description: item.description,
      currentLevel: item.currentLevel,
      targetLevel: item.targetLevel,
      weight: item.weight ?? 0,
      selfGrade,
      managerGrade,
      selfPoints: gradePoints(selfGrade),
      managerPoints: gradePoints(managerGrade),
    };
  });
}

export function compositeScore(
  rows: PerformanceItemComparison[],
  rater: "self" | "manager"
): number | null {
  let total = 0;
  let totalWeight = 0;
  for (const row of rows) {
    const points = rater === "self" ? row.selfPoints : row.managerPoints;
    if (points != null) {
      total += row.weight * points;
      totalWeight += row.weight;
    }
  }
  // Normalize by the actual weight sum so the result is a true 100-point-scale
  // weighted average even if an item's weights don't add up to exactly 1.
  return totalWeight > 0 ? Math.round((total / totalWeight) * 10) / 10 : null;
}
