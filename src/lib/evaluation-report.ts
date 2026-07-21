export type ItemComparison = {
  id: string;
  category: string;
  label: string;
  description: string | null;
  type: string;
  maxScore: number;
  self: number | null;
  manager: number | null;
  selfComment: string | null;
  comment: string | null;
  average: number | null;
  diff: number | null;
  classification: "강점" | "약점" | "보통" | "재논의 필요" | null;
  feedbackFlag: "1:1 미팅 추천" | "셀프 피드백 필요" | null;
};

type TemplateItemLike = {
  id: string;
  category: string;
  label: string;
  description: string | null;
  type: string;
  maxScore: number;
};

type ScoreLike = {
  score: number | null;
  selfScore: number | null;
  comment: string | null;
  selfComment: string | null;
};

export function buildComparison(
  items: TemplateItemLike[],
  scoreByItem: Map<string, ScoreLike>
): ItemComparison[] {
  return items.map((item) => {
    const s = scoreByItem.get(item.id);
    const self = s?.selfScore ?? null;
    const manager = s?.score ?? null;

    let average: number | null = null;
    let diff: number | null = null;
    let classification: ItemComparison["classification"] = null;
    let feedbackFlag: ItemComparison["feedbackFlag"] = null;

    if (item.type === "SCORE" && self != null && manager != null) {
      average = (self + manager) / 2;
      diff = manager - self;

      if (Math.abs(diff) >= 2) {
        classification = "재논의 필요";
      } else if (average > 3) {
        classification = "강점";
      } else if (average < 3) {
        classification = "약점";
      } else {
        classification = "보통";
      }

      if (diff <= -2) feedbackFlag = "1:1 미팅 추천";
      else if (diff <= -1) feedbackFlag = "셀프 피드백 필요";
    }

    return {
      id: item.id,
      category: item.category,
      label: item.label,
      description: item.description,
      type: item.type,
      maxScore: item.maxScore,
      self,
      manager,
      selfComment: s?.selfComment ?? null,
      comment: s?.comment ?? null,
      average,
      diff,
      classification,
      feedbackFlag,
    };
  });
}
