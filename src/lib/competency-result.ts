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
 * 역량 평균(1~5)을 100점 자리로 옮긴다 — **평균 × 20**.
 *
 * 사내 결과지의 셈이 그렇다(평균 4.3 → 86점). 역량평가 스케일 표의 «점수환산
 * (참고용)»은 110점까지 올라가지만 그건 읽는 눈금이고, 결과지에 실리는 값은
 * 5점 만점을 100점으로 편 것이다.
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

/** 강점·약점을 가르는 문턱. 결과지에 적힌 규칙 그대로다. */
const STRENGTH_THRESHOLD = 3;
/** 자기평가와 팀장평가가 이만큼 벌어지면 강점·약점에서 뺀다 — 양식의 «차이가 클 경우는 제외». */
const GAP_EXCLUDE = 2;
const MAX_PICKS = 3;

/**
 * 주요 강점 · 약점 역량.
 *
 * 결과지에 적힌 규칙을 그대로 쓴다 — 「자기 평가와 팀장 평가의 평균이 3점 초과인
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
  const steady = scored.filter(
    (r) => r.gap == null || Math.abs(r.gap) < GAP_EXCLUDE,
  );

  const strengths = [...steady]
    .filter((r) => r.avg! > STRENGTH_THRESHOLD)
    .sort((a, b) => b.avg! - a.avg! || a.area.localeCompare(b.area))
    .slice(0, MAX_PICKS);

  const weaknesses = [...steady]
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

/**
 * 차이에 붙는 안내. 결과지에 적힌 두 문턱을 그대로 읽는다 — 「팀장과 자기 평가의
 * 차이가 -1 이상인 경우 셀프 피드백이 필요하며, 2 이상인 역량의 경우 팀장과의
 * 1:1 미팅을 통한 셀프 피드백을 추천드립니다.」
 *
 * 여기서 «-1 이상»은 자기가 팀장보다 1점 이상 높게 본 경우를 말한다(차이 ≤ -1).
 *
 * 딱지는 «필요 · 추천»을 떼고 짧게 둔다 — 표의 한 칸에 열 줄이 나란히 붙는 자리라
 * 길면 칸을 밀어 내고, 무엇을 권하는지는 표 아래 한 줄이 그대로 적어 준다.
 */
export function gapNote(gap: number | null): string | null {
  if (gap == null) return null;
  if (gap <= -1) return "셀프 피드백";
  if (gap >= GAP_EXCLUDE) return "1:1 미팅";
  return null;
}
