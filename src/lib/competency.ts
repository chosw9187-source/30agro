/**
 * 역량평가 — 양식이 아니라 **규칙**을 담는다.
 *
 * 문항 자체는 DB에 있다(`CompetencyForm` → `CompetencyItemSet` → `CompetencyFormItem`).
 * 해마다 인사팀이 문항을 갈아야 하고, 그때마다 개발자를 찾아오게 둘 수 없다.
 * 첫 연도판의 밑그림만 `competency-seed.ts`에 있고, 한 번 심은 뒤로는 DB가 원본이다.
 *
 * 여기 남는 것은 해마다 바뀌지 않는 것들이다 — 평가스케일, 안내 문구, 누가 누구를
 * 평가하는지, 평균을 어떻게 내는지, 그리고 «이 사람에게 어느 묶음이 뜨는가».
 */

/** 1~5 정수. 소수점은 받지 않는다 — 양식의 규칙이다. */
export const COMPETENCY_MIN = 1;
export const COMPETENCY_MAX = 5;

/**
 * 묶음 하나의 문항 수 — 다섯 줄로 고정한다.
 *
 * 평균을 내므로 문항 수가 달라도 계산은 되지만, 다섯 줄로 못 박아 두면 사람마다
 * 받는 문항 수가 같아서 «저 팀은 세 줄만 받았다»는 말이 나오지 않는다. 묶음을
 * 만들 때 빈 다섯 줄을 미리 깔아 주는 근거도 이 값이다.
 */
export const COMPETENCY_ITEMS_PER_SET = 5;

export type CompetencyScaleRow = {
  score: number;
  /** 「탁월」처럼 점수 옆에 붙는 이름. */
  label: string;
  /** 인사팀이 참고용으로 적어 둔 점수 환산 구간. 화면에서도 «참고용»으로 적는다. */
  points: string;
  definition: string;
};

/** 평가스케일 정의. 높은 점수가 위로 오게 둔다 — 양식과 같은 순서다. */
export const COMPETENCY_SCALE: CompetencyScaleRow[] = [
  {
    score: 5,
    label: "탁월",
    points: "110점 이상",
    definition:
      "매우 우수해 타인을 지도하는 수준으로 관련 행동이 익숙하게 항상 나타남",
  },
  {
    score: 4,
    label: "우수",
    points: "100 ~ 110점 미만",
    definition:
      "상당히 숙련되고 광범위하게 응용하며, 관련행동이 일관적으로 나타남",
  },
  {
    score: 3,
    label: "보통",
    points: "90 ~ 100점 미만",
    definition: "업무에 적용해 활용하며, 관련행동이 평소에 자주 나타남",
  },
  {
    score: 2,
    label: "미흡",
    points: "80 ~ 90점 미만",
    definition:
      "업무에 제한적으로 적용하며, 관련 행동이 나타나지만 일관적이지 않음",
  },
  {
    score: 1,
    label: "부족",
    points: "80점 미만",
    definition: "습득 및 학습을 하는 수준으로 관련 행동이 가끔 나타남",
  },
];

const SCALE_BY_SCORE = new Map(COMPETENCY_SCALE.map((r) => [r.score, r]));

/** 「4 (우수)」. 점수만 적어 두면 그 숫자가 무슨 뜻인지 표에서 읽히지 않는다. */
export function competencyScoreLabel(score: number): string {
  const row = SCALE_BY_SCORE.get(score);
  return row ? `${score} (${row.label})` : String(score);
}

/** 양식 맨 위의 ※ 안내. 화면에도 같이 둔다 — 평가하는 동안 읽어야 할 규칙이다. */
export const COMPETENCY_NOTES = [
  "본 평가는 한국삼공 구성원의 역량을 평가하고 피드백을 제공하여 각자의 강점은 강화하고 약점은 무력화하는 것을 초점으로 합니다.",
  "각 질문을 깊게 고민한 뒤 평가 스케일에 맞는 숫자를 고르시되, 가급적 행동을 근거로 하여 평가해 주시기 바랍니다.",
  "스케일은 정수로만 고릅니다 (소수점 불가).",
] as const;

/**
 * 역량평가를 **받는** 직책 — 담당과 팀장뿐이다.
 *
 * 평가 관계는 조직도를 따라 두 갈래로만 돈다: 담당은 그 팀의 팀장이, 팀장은
 * 부문의 책임(없으면 본부의 운영책임)이 평가한다. 그 위 — 책임·운영책임·사장 —
 * 는 역량평가 대상이 아니다.
 *
 * 직책으로 가른다. «1차 평가자가 있는 사람»으로 가르면 사슬이 위로 계속
 * 이어져서 운영책임도 사장에게 평가받는 대상이 되어 버린다.
 */
export const COMPETENCY_TARGET_POSITIONS = ["STAFF", "TEAM_LEADER"] as const;

export function isCompetencyTarget(position: string): boolean {
  return (COMPETENCY_TARGET_POSITIONS as readonly string[]).includes(position);
}

export type CompetencyItem = {
  /** 점수를 잇는 열쇠. 한 번 정하면 바꾸지 않는다. */
  key: string;
  /** 표 왼쪽 칸 — 「문제해결」. */
  area: string;
  /** 표 가운데 칸 — 질문 한 문장. */
  question: string;
};

/** 핵심가치 묶음의 갈래 — 팀원과 팀장이 서로 다른 다섯 줄을 받는다. */
export type CoreSetKind = "CORE_STAFF" | "CORE_LEADER";

export function coreKindFor(position: string): CoreSetKind {
  return position === "TEAM_LEADER" ? "CORE_LEADER" : "CORE_STAFF";
}

/** DB에서 읽어 온 묶음 한 벌 — 화면과 저장이 같은 모양으로 받는다. */
export type LoadedSet = {
  id: string;
  kind: string;
  name: string;
  items: CompetencyItem[];
};

/** 직무역량 배정 한 줄. 팀 기본값이면 teamId, 사람 예외면 userId가 찬다. */
export type LoadedAssignment = {
  setId: string;
  teamId: string | null;
  userId: string | null;
};

/**
 * 이 사람에게 뜰 문항 두 묶음.
 *
 * 두 묶음 모두 **직책**이 갈래를 정한다.
 *   - 담당: 핵심가치 팀원용 + **직무역량**(직무마다 다름)
 *   - 팀장: 핵심가치 팀장용 + **리더십역량**(전사 한 벌)
 *
 * 팀장 양식에는 직무역량이 없다. 직무를 얼마나 아느냐가 아니라 «이끄는 일»을
 * 보기 때문이고, 그래서 직무처럼 갈리지도 않는다 — 배정할 것이 없다.
 *
 * 담당의 직무역량은 **사람 예외가 팀 기본값을 이긴다**. 관리팀 하나에
 * 환경안전·일반·출고 세 직무가 있어서, 팀만 보고 정하면 세 사람 중 둘이 남의
 * 문항으로 평가받는다.
 */
export function pickCompetencySets(
  person: { position: string; teamId: string | null; id: string },
  sets: LoadedSet[],
  assignments: LoadedAssignment[],
): { core: LoadedSet | null; job: LoadedSet | null } {
  const core =
    sets.find((s) => s.kind === coreKindFor(person.position)) ?? null;

  if (person.position === "TEAM_LEADER") {
    return { core, job: sets.find((s) => s.kind === "LEADERSHIP") ?? null };
  }

  const mine = assignments.find((a) => a.userId === person.id);
  const byTeam = person.teamId
    ? assignments.find((a) => a.teamId === person.teamId)
    : undefined;
  const setId = (mine ?? byTeam)?.setId ?? null;
  const job = setId ? (sets.find((s) => s.id === setId) ?? null) : null;

  return { core, job };
}

/** 직무역량을 배정해야 하는 사람인가 — 팀장은 리더십역량을 받으므로 아니다. */
export function needsJobSet(position: string): boolean {
  return isCompetencyTarget(position) && position !== "TEAM_LEADER";
}

/**
 * 역량평가에서 빠진 사람인가.
 *
 * 사람 줄이 팀 줄을 이긴다 — 팀을 통째로 뺐더라도 그중 한 명은 평가해야 하는
 * 경우가 있고, 그때 팀에서 꺼내지 않고 그 사람만 되돌릴 수 있어야 한다.
 */
export function competencyExcluded(
  person: { id: string; teamId: string | null },
  rows: {
    teamId: string | null;
    userId: string | null;
    included: boolean;
    reason: string | null;
  }[],
): { excluded: boolean; reason: string | null } {
  const mine = rows.find((r) => r.userId === person.id);
  if (mine) return { excluded: !mine.included, reason: mine.reason };
  const byTeam = person.teamId
    ? rows.find((r) => r.teamId === person.teamId)
    : undefined;
  if (byTeam) return { excluded: !byTeam.included, reason: byTeam.reason };
  return { excluded: false, reason: null };
}

/** 그 사람에게 실제로 뜨는 문항 열쇠 전부 — 저장할 때 «이 열쇠가 이 사람 것인가»를 따진다. */
export function competencyItemKeys(picked: {
  core: LoadedSet | null;
  job: LoadedSet | null;
}): Set<string> {
  return new Set(
    [...(picked.core?.items ?? []), ...(picked.job?.items ?? [])].map(
      (i) => i.key,
    ),
  );
}

export type CompetencyScoreRow = {
  itemKey: string;
  selfScore: number | null;
  leadScore: number | null;
};

/**
 * 자기평가·팀장평가의 평균.
 *
 * **적은 칸만** 센다. 안 적은 칸을 0으로 채우면 열 문항 중 셋만 적힌 사람이
 * 1점대로 보인다 — 낮은 게 아니라 아직 안 한 것이다. 그래서 한 칸도 안 적혀
 * 있으면 평균은 0이 아니라 null이다.
 *
 * 소수 한 자리로 끊는다. 3.3333333333333335가 표에 박히면 그 줄을 읽을 수 없다.
 */
export function competencyAverage(rows: CompetencyScoreRow[]): {
  self: number | null;
  lead: number | null;
  /**
   * 자기평가·팀장평가를 한 덩어리로 본 평균. **화면에 적는 값**이라 소수 한
   * 자리로 끊는다.
   */
  overall: number | null;
  /**
   * 반올림하지 않은 평균. 100점 환산은 **이 값**으로 한다.
   *
   * 끊은 평균으로 곱하면 점수가 틀어진다. 스무 칸의 합이 83이면 평균은 4.15이고
   * 100점 환산은 83점인데, 평균을 4.2로 끊어 놓고 20을 곱하면 84점이 된다 —
   * 한 점이 어디서 왔는지 아무도 설명할 수 없는 점수다. 사람이 칸을 다 더해
   * 맞춰 볼 수 있는 숫자여야 한다.
   */
  overallExact: number | null;
  /** 적힌 칸의 점수 합과 칸 수. 화면이 «다 더하면 몇 점»을 그대로 적는 데 쓴다. */
  sum: number;
  count: number;
  selfCount: number;
  leadCount: number;
} {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const selfVals = rows
    .map((r) => r.selfScore)
    .filter((v): v is number => v != null);
  const leadVals = rows
    .map((r) => r.leadScore)
    .filter((v): v is number => v != null);
  const exactMean = (vals: number[]) =>
    vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const mean = (vals: number[]) => {
    const m = exactMean(vals);
    return m == null ? null : round1(m);
  };
  const both = [...selfVals, ...leadVals];
  return {
    self: mean(selfVals),
    lead: mean(leadVals),
    overall: mean(both),
    overallExact: exactMean(both),
    sum: both.reduce((a, b) => a + b, 0),
    count: both.length,
    selfCount: selfVals.length,
    leadCount: leadVals.length,
  };
}

/** 폼에서 온 값을 1~5 정수로만 통과시킨다. 빈 값은 «아직 안 적음»이라 null이다. */
export function parseCompetencyScore(raw: unknown): number | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < COMPETENCY_MIN || n > COMPETENCY_MAX) {
    return null;
  }
  return n;
}
