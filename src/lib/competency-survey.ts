export type CompetencyKey =
  | "RESPONSIBILITY"
  | "PROBLEM_SOLVING"
  | "COLLABORATION"
  | "EXECUTION"
  | "LEARNING_AGILITY"
  | "EMOTIONAL_STABILITY";

export const COMPETENCIES: { key: CompetencyKey; label: string }[] = [
  { key: "RESPONSIBILITY", label: "책임감" },
  { key: "PROBLEM_SOLVING", label: "문제해결력" },
  { key: "COLLABORATION", label: "협업·소통력" },
  { key: "EXECUTION", label: "실행력" },
  { key: "LEARNING_AGILITY", label: "학습민첩성" },
  { key: "EMOTIONAL_STABILITY", label: "정서안정성" },
];

export const STRENGTH_COMMENT: Record<CompetencyKey, string> = {
  RESPONSIBILITY: "맡은 일은 끝까지 마무리하려는 책임감이 강합니다. 결과에 대한 핑계보다 스스로 해결하려는 태도를 보입니다.",
  PROBLEM_SOLVING: "문제 상황에서 원인을 분석하고 대안을 비교해 최선의 해법을 찾아내는 능력이 뛰어납니다.",
  COLLABORATION: "동료의 의견을 경청하고 생각을 명확히 전달하며, 갈등 상황도 원만하게 조율하는 편입니다.",
  EXECUTION: "계획한 일을 신속하게 행동으로 옮기고, 장애물이 있어도 끝까지 추진하는 힘이 있습니다.",
  LEARNING_AGILITY: "새로운 업무 방식이나 지식을 빠르게 습득하고, 피드백을 적극적으로 반영해 성장하는 편입니다.",
  EMOTIONAL_STABILITY: "압박이나 비판이 있는 상황에서도 평정심을 유지하며 감정 기복이 크지 않은 편입니다.",
};

export const WEAKNESS_COMMENT: Record<CompetencyKey, string> = {
  RESPONSIBILITY: "맡은 일을 끝까지 챙기는 것에 어려움을 느낄 수 있습니다. 마감 관리와 결과에 대한 책임 소재를 명확히 하는 습관이 도움이 될 수 있습니다.",
  PROBLEM_SOLVING: "복잡하거나 예상치 못한 문제 앞에서 판단을 내리는 데 시간이 걸릴 수 있습니다. 문제를 작은 단위로 나눠 접근하는 연습이 도움이 될 수 있습니다.",
  COLLABORATION: "협업보다 혼자 처리하는 방식을 선호할 수 있습니다. 의견을 먼저 나누고 조율하는 습관이 팀워크에 도움이 될 수 있습니다.",
  EXECUTION: "계획은 세우지만 실제 행동으로 옮기는 데 시간이 걸릴 수 있습니다. 작은 목표부터 바로 실행해보는 습관이 도움이 될 수 있습니다.",
  LEARNING_AGILITY: "익숙한 방식을 바꾸는 데 부담을 느낄 수 있습니다. 새로운 시도를 작은 단위로 늘려가는 것이 도움이 될 수 있습니다.",
  EMOTIONAL_STABILITY: "예상치 못한 변화나 스트레스 상황에서 불안을 느끼기 쉬울 수 있습니다. 스스로를 진정시키는 루틴을 마련하면 도움이 될 수 있습니다.",
};

export type ItemKind = "TRAIT" | "CONSISTENCY_CHECK" | "SOCIAL_DESIRABILITY";

export type SurveyItem = {
  id: string;
  competency: CompetencyKey | null;
  text: string;
  reverse: boolean;
  kind: ItemKind;
  /** CONSISTENCY_CHECK 문항이 같은 의미로 짝을 이루는 TRAIT 문항의 id. */
  pairsWith?: string;
};

export const SURVEY_ITEMS: SurveyItem[] = [
  { id: "r1", competency: "RESPONSIBILITY", text: "나는 맡은 일은 끝까지 마무리한다.", reverse: false, kind: "TRAIT" },
  { id: "r2", competency: "RESPONSIBILITY", text: "나는 결과에 대해 핑계보다 책임을 우선한다.", reverse: false, kind: "TRAIT" },
  { id: "r3", competency: "RESPONSIBILITY", text: "나는 마감 기한을 지키기 위해 계획적으로 움직인다.", reverse: false, kind: "TRAIT" },
  { id: "r4", competency: "RESPONSIBILITY", text: "나는 내가 맡은 업무의 결과에 대해 스스로 책임진다.", reverse: false, kind: "TRAIT" },
  { id: "r5", competency: "RESPONSIBILITY", text: "나는 작은 일이라도 소홀히 하지 않으려 한다.", reverse: false, kind: "TRAIT" },
  { id: "r6", competency: "RESPONSIBILITY", text: "나는 어려운 일이 생기면 남에게 미루고 싶어진다.", reverse: true, kind: "TRAIT" },
  { id: "r8", competency: "RESPONSIBILITY", text: "나는 마감을 종종 넘기는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "r9", competency: "RESPONSIBILITY", text: "나는 내 실수를 남 탓으로 돌리곤 한다.", reverse: true, kind: "TRAIT" },
  { id: "r10", competency: "RESPONSIBILITY", text: "나는 사소한 업무는 대충 처리해도 된다고 생각한다.", reverse: true, kind: "TRAIT" },
  { id: "r11", competency: "RESPONSIBILITY", text: "나는 맡은 일이 힘들어지면 중간에 포기하고 싶어진다.", reverse: true, kind: "TRAIT" },
  { id: "r7", competency: "RESPONSIBILITY", text: "나는 시작한 업무는 도중에 그만두지 않고 끝까지 해낸다.", reverse: false, kind: "CONSISTENCY_CHECK", pairsWith: "r1" },

  { id: "p1", competency: "PROBLEM_SOLVING", text: "나는 문제가 생기면 원인을 차근차근 분석한다.", reverse: false, kind: "TRAIT" },
  { id: "p2", competency: "PROBLEM_SOLVING", text: "나는 여러 대안을 비교해서 최선의 방법을 선택한다.", reverse: false, kind: "TRAIT" },
  { id: "p3", competency: "PROBLEM_SOLVING", text: "나는 예상치 못한 상황에서도 침착하게 해결책을 찾는다.", reverse: false, kind: "TRAIT" },
  { id: "p4", competency: "PROBLEM_SOLVING", text: "나는 문제의 핵심을 빠르게 파악하는 편이다.", reverse: false, kind: "TRAIT" },
  { id: "p5", competency: "PROBLEM_SOLVING", text: "나는 같은 문제가 반복되지 않도록 근본 원인을 찾으려 한다.", reverse: false, kind: "TRAIT" },
  { id: "p6", competency: "PROBLEM_SOLVING", text: "나는 복잡한 문제 앞에서는 판단을 미루는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "p8", competency: "PROBLEM_SOLVING", text: "나는 문제가 생기면 원인을 따지기보다 일단 넘어가려 한다.", reverse: true, kind: "TRAIT" },
  { id: "p9", competency: "PROBLEM_SOLVING", text: "나는 같은 실수를 반복해도 크게 신경 쓰지 않는다.", reverse: true, kind: "TRAIT" },
  { id: "p10", competency: "PROBLEM_SOLVING", text: "나는 여러 대안을 고민하기보다 처음 떠오른 방법을 바로 선택한다.", reverse: true, kind: "TRAIT" },
  { id: "p11", competency: "PROBLEM_SOLVING", text: "나는 예상치 못한 상황이 생기면 쉽게 당황해서 우왕좌왕한다.", reverse: true, kind: "TRAIT" },
  { id: "p7", competency: "PROBLEM_SOLVING", text: "나는 어려움이 생기면 왜 그런 일이 생겼는지부터 따져본다.", reverse: false, kind: "CONSISTENCY_CHECK", pairsWith: "p1" },

  { id: "c1", competency: "COLLABORATION", text: "나는 동료의 의견을 끝까지 듣고 반영하려 한다.", reverse: false, kind: "TRAIT" },
  { id: "c2", competency: "COLLABORATION", text: "나는 내 생각을 명확하게 전달하는 편이다.", reverse: false, kind: "TRAIT" },
  { id: "c3", competency: "COLLABORATION", text: "나는 갈등 상황에서도 원만하게 조율하려 노력한다.", reverse: false, kind: "TRAIT" },
  { id: "c4", competency: "COLLABORATION", text: "나는 필요한 정보를 동료와 적극적으로 공유한다.", reverse: false, kind: "TRAIT" },
  { id: "c5", competency: "COLLABORATION", text: "나는 다른 사람의 입장에서 상황을 이해하려 노력한다.", reverse: false, kind: "TRAIT" },
  { id: "c6", competency: "COLLABORATION", text: "나는 혼자 일하는 것이 협업보다 편하다.", reverse: true, kind: "TRAIT" },
  { id: "c8", competency: "COLLABORATION", text: "나는 내 의견과 다르면 동료의 말을 잘 듣지 않는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "c9", competency: "COLLABORATION", text: "나는 필요한 정보를 동료와 공유하는 것이 귀찮게 느껴진다.", reverse: true, kind: "TRAIT" },
  { id: "c10", competency: "COLLABORATION", text: "나는 갈등이 생기면 대화보다는 피하는 쪽을 택한다.", reverse: true, kind: "TRAIT" },
  { id: "c11", competency: "COLLABORATION", text: "나는 다른 사람의 입장을 굳이 이해하려 하지 않는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "c7", competency: "COLLABORATION", text: "나는 동료가 말할 때 끝까지 경청하고 의견을 존중하는 편이다.", reverse: false, kind: "CONSISTENCY_CHECK", pairsWith: "c1" },

  { id: "e1", competency: "EXECUTION", text: "나는 계획한 일을 실제 행동으로 빠르게 옮긴다.", reverse: false, kind: "TRAIT" },
  { id: "e2", competency: "EXECUTION", text: "나는 목표를 세우면 끝까지 추진한다.", reverse: false, kind: "TRAIT" },
  { id: "e3", competency: "EXECUTION", text: "나는 망설이기보다 일단 시도해보는 편이다.", reverse: false, kind: "TRAIT" },
  { id: "e4", competency: "EXECUTION", text: "나는 우선순위를 정해 중요한 일부터 처리한다.", reverse: false, kind: "TRAIT" },
  { id: "e5", competency: "EXECUTION", text: "나는 예상치 못한 장애물이 생겨도 끝까지 밀어붙인다.", reverse: false, kind: "TRAIT" },
  { id: "e6", competency: "EXECUTION", text: "나는 계획은 잘 세우지만 실행은 미루는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "e8", competency: "EXECUTION", text: "나는 결정을 내려도 실제 행동으로 옮기기까지 시간이 오래 걸린다.", reverse: true, kind: "TRAIT" },
  { id: "e9", competency: "EXECUTION", text: "나는 우선순위를 정하지 않고 손에 잡히는 대로 일한다.", reverse: true, kind: "TRAIT" },
  { id: "e10", competency: "EXECUTION", text: "나는 목표를 세워도 중간에 흐지부지되는 경우가 많다.", reverse: true, kind: "TRAIT" },
  { id: "e11", competency: "EXECUTION", text: "나는 장애물이 생기면 쉽게 포기하는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "e7", competency: "EXECUTION", text: "나는 결정한 일은 미루지 않고 바로 실행에 옮긴다.", reverse: false, kind: "CONSISTENCY_CHECK", pairsWith: "e1" },

  { id: "l1", competency: "LEARNING_AGILITY", text: "나는 새로운 업무 방식을 빠르게 습득한다.", reverse: false, kind: "TRAIT" },
  { id: "l2", competency: "LEARNING_AGILITY", text: "나는 낯선 상황에서도 필요한 정보를 적극적으로 찾는다.", reverse: false, kind: "TRAIT" },
  { id: "l3", competency: "LEARNING_AGILITY", text: "나는 실수를 통해 배우고 다음에 개선하려 한다.", reverse: false, kind: "TRAIT" },
  { id: "l4", competency: "LEARNING_AGILITY", text: "나는 새로운 지식이나 기술을 배우는 것을 즐긴다.", reverse: false, kind: "TRAIT" },
  { id: "l5", competency: "LEARNING_AGILITY", text: "나는 다른 사람의 피드백을 적극적으로 받아들여 발전시킨다.", reverse: false, kind: "TRAIT" },
  { id: "l6", competency: "LEARNING_AGILITY", text: "나는 익숙한 방식을 바꾸는 것이 부담스럽다.", reverse: true, kind: "TRAIT" },
  { id: "l8", competency: "LEARNING_AGILITY", text: "나는 새로운 업무 방식을 익히는 데 오래 걸리는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "l9", competency: "LEARNING_AGILITY", text: "나는 낯선 상황에서 필요한 정보를 찾는 것을 미루는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "l10", competency: "LEARNING_AGILITY", text: "나는 실수해도 크게 돌아보지 않고 넘어가는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "l11", competency: "LEARNING_AGILITY", text: "나는 다른 사람의 피드백을 듣기보다 내 방식을 고수하는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "l7", competency: "LEARNING_AGILITY", text: "나는 낯선 업무 방식도 금방 익혀서 적용하는 편이다.", reverse: false, kind: "CONSISTENCY_CHECK", pairsWith: "l1" },

  { id: "s1", competency: "EMOTIONAL_STABILITY", text: "나는 압박이 심한 상황에서도 평정심을 유지한다.", reverse: false, kind: "TRAIT" },
  { id: "s2", competency: "EMOTIONAL_STABILITY", text: "나는 비판을 받아도 감정적으로 크게 흔들리지 않는다.", reverse: false, kind: "TRAIT" },
  { id: "s3", competency: "EMOTIONAL_STABILITY", text: "나는 스트레스 상황에서 스스로를 잘 다독인다.", reverse: false, kind: "TRAIT" },
  { id: "s4", competency: "EMOTIONAL_STABILITY", text: "나는 업무 중 감정 기복이 크지 않은 편이다.", reverse: false, kind: "TRAIT" },
  { id: "s5", competency: "EMOTIONAL_STABILITY", text: "나는 갑작스러운 변화가 생겨도 침착함을 유지하려 한다.", reverse: false, kind: "TRAIT" },
  { id: "s6", competency: "EMOTIONAL_STABILITY", text: "나는 예상치 못한 일이 생기면 쉽게 불안해진다.", reverse: true, kind: "TRAIT" },
  { id: "s8", competency: "EMOTIONAL_STABILITY", text: "나는 압박이 심한 상황에서 쉽게 흔들리는 편이다.", reverse: true, kind: "TRAIT" },
  { id: "s9", competency: "EMOTIONAL_STABILITY", text: "나는 비판을 받으면 감정적으로 크게 동요한다.", reverse: true, kind: "TRAIT" },
  { id: "s10", competency: "EMOTIONAL_STABILITY", text: "나는 스트레스를 받으면 스스로 다스리기 어렵다.", reverse: true, kind: "TRAIT" },
  { id: "s11", competency: "EMOTIONAL_STABILITY", text: "나는 업무 중 감정 기복이 큰 편이다.", reverse: true, kind: "TRAIT" },
  { id: "s7", competency: "EMOTIONAL_STABILITY", text: "나는 긴장되는 상황에서도 마음의 평정을 잃지 않으려 한다.", reverse: false, kind: "CONSISTENCY_CHECK", pairsWith: "s1" },

  { id: "sd1", competency: null, text: "나는 지금까지 살면서 단 한 번도 거짓말을 한 적이 없다.", reverse: false, kind: "SOCIAL_DESIRABILITY" },
  { id: "sd2", competency: null, text: "나는 누구에게도 화를 낸 적이 없다.", reverse: false, kind: "SOCIAL_DESIRABILITY" },
  { id: "sd3", competency: null, text: "나는 지금까지 실수를 한 적이 단 한 번도 없다.", reverse: false, kind: "SOCIAL_DESIRABILITY" },
  { id: "sd4", competency: null, text: "나는 항상 모든 약속을 완벽하게 지킨다.", reverse: false, kind: "SOCIAL_DESIRABILITY" },
  { id: "sd5", competency: null, text: "나는 다른 사람을 험담해본 적이 전혀 없다.", reverse: false, kind: "SOCIAL_DESIRABILITY" },
  { id: "sd6", competency: null, text: "나는 어떤 상황에서도 짜증을 낸 적이 없다.", reverse: false, kind: "SOCIAL_DESIRABILITY" },
];

export const LIKERT_LABELS = ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다"];

export type CompetencyScores = Record<CompetencyKey, number>;

export function computeCompetencyScores(answers: Record<string, number>): CompetencyScores {
  const sums: Partial<Record<CompetencyKey, number>> = {};
  const counts: Partial<Record<CompetencyKey, number>> = {};

  for (const item of SURVEY_ITEMS) {
    if (item.kind !== "TRAIT" || !item.competency) continue;
    const raw = answers[item.id];
    if (!raw || raw < 1 || raw > 5) continue;
    const value = item.reverse ? 6 - raw : raw;
    sums[item.competency] = (sums[item.competency] ?? 0) + value;
    counts[item.competency] = (counts[item.competency] ?? 0) + 1;
  }

  const scores = {} as CompetencyScores;
  for (const c of COMPETENCIES) {
    const count = counts[c.key] ?? 0;
    const avg = count > 0 ? (sums[c.key] ?? 0) / count : 0;
    scores[c.key] = Math.round(((avg - 1) / 4) * 100 * 10) / 10;
  }
  return scores;
}

export function overallScore(scores: CompetencyScores): number {
  const vals = COMPETENCIES.map((c) => scores[c.key]);
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/** 100 = 기준 프로파일과 완전히 동일, 편차가 클수록 낮아짐. */
export function fitScore(profile: CompetencyScores, benchmark: CompetencyScores): number {
  const diffs = COMPETENCIES.map((c) => Math.abs(profile[c.key] - benchmark[c.key]));
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return Math.max(0, Math.round((100 - avgDiff) * 10) / 10);
}

/** 6개 역량 중 점수 기준 상위 n개(강점) / 하위 n개(약점) 키를 반환. */
export function topBottomCompetencies(scores: CompetencyScores, n = 2) {
  const sorted = [...COMPETENCIES].sort((a, b) => scores[b.key] - scores[a.key]);
  return {
    strengths: sorted.slice(0, n).map((c) => c.key),
    weaknesses: sorted.slice(-n).map((c) => c.key),
  };
}

export function averageScores(list: CompetencyScores[]): CompetencyScores {
  const result = {} as CompetencyScores;
  for (const c of COMPETENCIES) {
    const vals = list.map((s) => s[c.key]);
    result[c.key] = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
  }
  return result;
}

export type ReliabilityResult = {
  reliable: boolean;
  mismatchCount: number;
  socialDesirabilityAvg: number;
};

/**
 * 같은 뜻을 다르게 물어본 문항 쌍의 응답이 크게 어긋나거나(불성실/무작위
 * 응답 의심), "나는 거짓말을 한 적이 없다" 류의 비현실적인 자기고양 문항에
 * 지나치게 동의하면(의도적으로 좋게 보이려는 응답 의심) 신뢰도를 낮게 본다.
 */
export function computeReliability(answers: Record<string, number>): ReliabilityResult {
  let mismatchCount = 0;
  for (const item of SURVEY_ITEMS) {
    if (item.kind !== "CONSISTENCY_CHECK" || !item.pairsWith) continue;
    const a = answers[item.pairsWith];
    const b = answers[item.id];
    if (!a || !b) continue;
    if (Math.abs(a - b) >= 2) mismatchCount++;
  }

  const sdItems = SURVEY_ITEMS.filter((i) => i.kind === "SOCIAL_DESIRABILITY");
  const sdVals = sdItems.map((i) => answers[i.id]).filter((v): v is number => !!v);
  const socialDesirabilityAvg =
    sdVals.length > 0 ? Math.round((sdVals.reduce((a, b) => a + b, 0) / sdVals.length) * 10) / 10 : 0;

  return {
    reliable: mismatchCount < 2 && socialDesirabilityAvg < 4,
    mismatchCount,
    socialDesirabilityAvg,
  };
}
