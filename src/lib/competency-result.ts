import { COMPETENCY_MAX } from "@/lib/competency";

/**
 * 인사평가 결과지의 셈 — 성과 · 역량 · 종합, 그리고 강점 · 약점.
 *
 * 사내 「인사평가 결과지」 한 장을 그대로 옮기는 데 필요한 계산만 담는다. 화면에
 * 섞어 두지 않는 이유는 이 숫자가 사람의 등급으로 이어지기 때문이다 — 어디서
 * 어떻게 나온 값인지 한 파일에서 읽히고, 고칠 때도 한 군데만 고친다.
 */

/**
 * 종합점수의 몫 — 성과 60%, 역량 40%.
 *
 * 인사팀이 정한 값이다. 나중에 관리 화면으로 빼낼 자리이므로 여기 상수 두 개로
 * 모아 둔다. 화면에도 이 몫을 그대로 적어 준다 — 89.6이라는 숫자만 보면 어떻게
 * 나온 값인지 알 수 없다.
 */
export const PERFORMANCE_WEIGHT = 0.6;
export const COMPETENCY_WEIGHT = 0.4;

/**
 * 역량 평균(1~10)을 100점 자리로 옮긴다 — **평균 × 10**.
 *
 * 사내 결과지의 셈이 그렇다(평균 4.3 → 86점). 역량평가 스케일 표의 «점수환산
 * (참고용)»은 110점까지 올라가지만 그건 읽는 눈금이고, 결과지에 실리는 값은
 * 만점(`COMPETENCY_MAX`)을 100점으로 편 것이다.
 *
 * 넘겨주는 평균은 **반올림하지 않은 값**이어야 한다(`competencyAverage`의
 * `overallExact`). 화면에 적는 평균은 소수 한 자리로 끊는데, 그 끊은 값으로
 * 곱하면 스무 칸 합 83점(평균 4.15)이 84점으로 올라간다 — 칸을 다 더해 맞춰
 * 보는 사람에게 설명할 수 없는 한 점이 붙는다.
 */
export function competencyScore100(average: number | null): number | null {
  if (average == null) return null;
  return Math.round(average * (100 / COMPETENCY_MAX) * 10) / 10;
}

/** 종합점수. 한쪽이라도 비어 있으면 null이다 — 반쪽으로 등급을 매기지 않는다. */
export function overallScore(
  performance: number | null,
  competency: number | null,
): number | null {
  if (performance == null || competency == null) return null;
  return (
    Math.round(
      (performance * PERFORMANCE_WEIGHT + competency * COMPETENCY_WEIGHT) * 10,
    ) / 10
  );
}

export type CompetencyResultRow = {
  itemKey: string;
  /** 「핵심가치」 · 「직무역량」 · 「리더십역량」. 표 왼쪽에서 묶는 데 쓴다. */
  group: string;
  area: string;
  self: number | null;
  lead: number | null;
  /** 두 점수의 평균. 한쪽만 적혀 있으면 그 값이다. */
  avg: number | null;
  /** 팀장 − 자기. 어느 쪽도 비어 있으면 null. */
  gap: number | null;
};

/** 평균과 차이를 채운 줄 — 결과지의 「역량별 결과」 표 한 줄이다. */
export function buildResultRow(
  base: { itemKey: string; group: string; area: string },
  self: number | null,
  lead: number | null,
): CompetencyResultRow {
  const vals = [self, lead].filter((v): v is number => v != null);
  const avg =
    vals.length > 0
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      : null;
  return {
    ...base,
    self,
    lead,
    avg,
    gap: self != null && lead != null ? lead - self : null,
  };
}

/*
  강점·약점을 가르는 문턱. **만점에서 끌어낸다** — 1~5에서 «평균 3점 초과가
  강점»이던 규칙은 만점의 60%라는 뜻이고, 1~10에서는 6점이다. 숫자를 그대로 두면
  열 칸 눈금에서 3점이 «보통 이상»이 되어 거의 모두가 강점으로 찍힌다.

  화면도 이 값을 읽어 「평균 6점을 넘으면 강점」이라고 적는다 — 문턱과 화면의
  설명이 따로 놀지 않게 한다.
*/
export const STRENGTH_THRESHOLD = COMPETENCY_MAX * 0.6;
const MAX_PICKS = 3;

/**
 * 주요 강점 · 약점 역량.
 *
 * 결과지에 적힌 규칙을 만점 비율로 옮겨 쓴다 — 「자기 평가와 팀장 평가의 평균이 만점의 60% 초과인
 * 경우 강점 역량으로, 미만인 경우 약점 역량으로 구분하고 있습니다. (차이가 클
 * 경우는 제외)」. 3점 초과가 열 개 다 해당될 수 있으므로 평균이 높은 순으로 셋만
 * 고른다.
 *
 * 3점 미만이 하나도 없으면 약점은 **비워 둔다**. 없는 약점을 만들어 적으면
 * 결과지를 받은 사람이 «내가 이걸 못한다고 적혀 있다»로 읽는다. 대신 상대적으로
 * 낮은 역량을 따로 알려 준다 — 그건 약점이 아니라 «그중에서는 낮은 쪽»이다.
 */
export function strengthsAndWeaknesses(rows: CompetencyResultRow[]): {
  strengths: CompetencyResultRow[];
  weaknesses: CompetencyResultRow[];
  /** 3점 미만이 없을 때의 «상대적으로 낮은 역량». */
  relativelyLow: CompetencyResultRow[];
} {
  const scored = rows.filter((r) => r.avg != null);

  const strengths = [...scored]
    .filter((r) => r.avg! > STRENGTH_THRESHOLD)
    .sort((a, b) => b.avg! - a.avg! || a.area.localeCompare(b.area))
    .slice(0, MAX_PICKS);

  const weaknesses = [...scored]
    .filter((r) => r.avg! < STRENGTH_THRESHOLD)
    .sort((a, b) => a.avg! - b.avg! || a.area.localeCompare(b.area))
    .slice(0, MAX_PICKS);

  let relativelyLow: CompetencyResultRow[] = [];
  if (weaknesses.length === 0 && scored.length > 0) {
    const lowest = Math.min(...scored.map((r) => r.avg!));
    const highest = Math.max(...scored.map((r) => r.avg!));
    // 모든 역량이 같은 점수면 «낮은 쪽»이라는 말이 성립하지 않는다.
    if (lowest < highest) {
      relativelyLow = scored
        .filter((r) => r.avg === lowest)
        .sort((a, b) => a.area.localeCompare(b.area))
        .slice(0, MAX_PICKS);
    }
  }

  return { strengths, weaknesses, relativelyLow };
}

/*
  자기평가와 팀장평가의 **차이는 이제 뽑기에 끼어들지 않는다.**

  양식에는 «차이가 클 경우는 제외»가 적혀 있었고, 그대로 옮겨 두 사람이 4점 이상
  다르게 본 역량은 강점·약점에서 뺐다. 그런데 정작 그 역량이 제일 이야기할 거리인
  경우가 많았고(자기 10 / 팀장 4), 화면에서는 왜 빠졌는지 보이지 않아서 «내 제일
  높은 점수가 강점에 없다»로 읽혔다. 차이는 「2. 역량별 결과」 표에서 숫자와
  색으로 그대로 보이므로, 뽑기에서는 평균만 본다.

  「셀프 피드백 / 1:1 미팅」 딱지를 붙이던 `gapNote`도 같은 이유로 걷었다.
*/
