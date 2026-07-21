export const GRADE_ORDER = ["S", "A", "B", "C", "D"] as const;
export type Grade = (typeof GRADE_ORDER)[number];

export const GRADE_POINTS: Record<Grade, number> = {
  S: 110,
  A: 100,
  B: 90,
  C: 80,
  D: 70,
};

export type GradeCriteria = Partial<Record<Grade, string>>;

export function parseGradeCriteria(json: string | null | undefined): GradeCriteria {
  if (!json) return {};
  try {
    return JSON.parse(json) as GradeCriteria;
  } catch {
    return {};
  }
}

export function stringifyGradeCriteria(criteria: GradeCriteria): string {
  return JSON.stringify(criteria);
}

export function isGrade(value: string): value is Grade {
  return (GRADE_ORDER as readonly string[]).includes(value);
}

export function gradePoints(grade: string | null | undefined): number | null {
  if (!grade || !isGrade(grade)) return null;
  return GRADE_POINTS[grade];
}
